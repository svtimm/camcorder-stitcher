#!/usr/bin/env node
import { Command } from "commander";
import { extname, join } from "node:path";
import { discoverClips } from "./discover.js";
import { DEFAULT_MAX_GAP_SECONDS, groupClips } from "./group.js";
import { stitchSession } from "./stitch.js";

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

    if (opts.dryRun) {
      return;
    }

    const multiClipSessions = sessions.filter((s) => s.clips.length > 1);
    if (multiClipSessions.length === 0) {
      console.log("No multi-clip sessions to stitch.");
      return;
    }

    const { mkdir } = await import("node:fs/promises");
    await mkdir(opts.outputDir, { recursive: true });

    for (const session of multiClipSessions) {
      const ext = extname(session.clips[0]!.name) || ".mp4";
      const outputPath = join(opts.outputDir, `${session.id}${ext}`);
      console.log(`Stitching "${session.id}" -> ${outputPath}`);
      await stitchSession(session, outputPath);
    }
  });

program.parseAsync(process.argv);
