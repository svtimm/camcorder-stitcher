#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { extname, join } from "node:path";
import { discoverClips } from "./discover.js";
import { DEFAULT_MAX_GAP_SECONDS, groupClips } from "./group.js";
import { stitchSession } from "./stitch.js";
import { loadTitleMap } from "./titles.js";
import type { PrivacyStatus, TitleMap } from "./types.js";
import {
  addVideoToPlaylist,
  buildVideoMetadata,
  defaultConfigDir,
  getAuthorizedClient,
  uploadVideo,
  YOUTUBE_PLAYLIST_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
} from "./youtube.js";

const PRIVACY_STATUSES: readonly PrivacyStatus[] = ["private", "unlisted", "public"];

function parsePrivacyStatus(value: string): PrivacyStatus {
  if (!PRIVACY_STATUSES.includes(value as PrivacyStatus)) {
    throw new InvalidArgumentError(`must be one of ${PRIVACY_STATUSES.join(", ")}`);
  }
  return value as PrivacyStatus;
}

function resolvePlaylistId(entry: TitleMap[string], defaultPlaylistId?: string): string | undefined {
  return entry.playlistId ?? defaultPlaylistId;
}

/** Only requests the broader playlist scope when a run actually uses one. */
function computeRequiredScopes(titleMap: TitleMap | null, defaultPlaylistId?: string): string[] {
  const usesPlaylist =
    Boolean(defaultPlaylistId) ||
    (titleMap !== null && Object.values(titleMap).some((entry) => entry.playlistId !== undefined));
  return usesPlaylist ? [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_PLAYLIST_SCOPE] : [YOUTUBE_UPLOAD_SCOPE];
}

const program = new Command();

program
  .name("camcorder-stitcher")
  .description(
    "Detect camcorder clips split by file-size limits and stitch each recording session back into one file.",
  )
  .argument("<dir>", "directory containing the camcorder clips")
  .option("-o, --output-dir <dir>", "directory to write stitched sessions into", "stitched")
  .option(
    "-g, --max-gap-seconds <seconds>",
    "max gap between clip mtimes to still count as one session",
    (value) => Number.parseInt(value, 10),
    DEFAULT_MAX_GAP_SECONDS,
  )
  .option("--dry-run", "print the detected sessions without writing any files", false)
  .option(
    "--titles <path>",
    "JSON file mapping session id -> upload metadata; passing this opts multi-clip " +
      "sessions found in it into a YouTube upload after stitching (optional)",
  )
  .option(
    "--privacy-status <status>",
    "default YouTube privacy status for uploaded videos (private, unlisted, public)",
    parsePrivacyStatus,
    "unlisted" as PrivacyStatus,
  )
  .option(
    "--client-secret <path>",
    "path to a Google OAuth 'Desktop app' client secret JSON",
    join(defaultConfigDir(), "client_secret.json"),
  )
  .option(
    "--playlist <id>",
    "default YouTube playlist id to add uploaded videos to (overridable per session in --titles)",
  )
  .action(async (dir: string, opts) => {
    const clips = await discoverClips(dir);
    if (clips.length === 0) {
      console.error(`No video clips found in ${dir}`);
      process.exitCode = 1;
      return;
    }

    const sessions = groupClips(clips, { maxGapSeconds: opts.maxGapSeconds });

    for (const session of sessions) {
      const names = session.clips.map((c) => c.name).join(", ");
      console.log(`Session "${session.id}" (${session.clips.length} clip(s)): ${names}`);
    }

    const titleMap = opts.titles ? await loadTitleMap(opts.titles) : null;

    if (opts.dryRun) {
      if (titleMap) {
        for (const session of sessions.filter((s) => s.clips.length > 1)) {
          const entry = titleMap[session.id];
          if (!entry) {
            console.log(`  -> "${session.id}" not in titles file, would be skipped`);
            continue;
          }
          const playlistId = resolvePlaylistId(entry, opts.playlist);
          const playlistNote = playlistId ? `, added to playlist "${playlistId}"` : "";
          console.log(
            `  -> would upload "${session.id}" as "${entry.title}" ` +
              `(${entry.privacyStatus ?? opts.privacyStatus})${playlistNote}`,
          );
        }
      }
      return;
    }

    const multiClipSessions = sessions.filter((s) => s.clips.length > 1);
    if (multiClipSessions.length === 0) {
      console.log("No multi-clip sessions to stitch.");
      return;
    }

    const { mkdir } = await import("node:fs/promises");
    await mkdir(opts.outputDir, { recursive: true });

    let auth: Awaited<ReturnType<typeof getAuthorizedClient>> | null = null;
    const scopes = computeRequiredScopes(titleMap, opts.playlist);

    for (const session of multiClipSessions) {
      const ext = extname(session.clips[0]!.name) || ".mp4";
      const outputPath = join(opts.outputDir, `${session.id}${ext}`);
      console.log(`Stitching "${session.id}" -> ${outputPath}`);
      await stitchSession(session, outputPath);

      if (!titleMap) {
        continue;
      }

      const entry = titleMap[session.id];
      if (!entry) {
        console.log(`  -> "${session.id}" not in titles file, skipping upload`);
        continue;
      }

      auth ??= await getAuthorizedClient({ clientSecretPath: opts.clientSecret, scopes });
      const metadata = buildVideoMetadata(entry, opts.privacyStatus);

      let videoId: string;
      try {
        const result = await uploadVideo(auth, outputPath, metadata);
        videoId = result.videoId;
        console.log(`  -> uploaded "${session.id}" as "${entry.title}": ${result.url}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  -> failed to upload "${session.id}": ${message}`);
        continue;
      }

      const playlistId = resolvePlaylistId(entry, opts.playlist);
      if (!playlistId) {
        continue;
      }
      try {
        await addVideoToPlaylist(auth, playlistId, videoId);
        console.log(`  -> added "${session.id}" to playlist "${playlistId}"`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `  -> uploaded "${session.id}" but failed to add it to playlist "${playlistId}": ${message}`,
        );
      }
    }
  });

program.parseAsync(process.argv);
