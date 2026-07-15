import { youtube as youtubeClient } from "@googleapis/youtube";
import { OAuth2Client } from "google-auth-library";
import type { Credentials } from "google-auth-library";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PrivacyStatus, TitleMapEntry, VideoMetadata } from "./types.js";

export const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
// playlistItems.insert doesn't accept youtube.upload; force-ssl is the
// narrowest scope Google's own API docs list that covers both playlist
// writes and (per videos.insert's documented scopes) uploads too.
export const YOUTUBE_PLAYLIST_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const CONSENT_TIMEOUT_MS = 5 * 60 * 1000;

export function defaultConfigDir(): string {
  return join(homedir(), ".config", "camcorder-stitcher");
}

/**
 * Builds the YouTube API request body for a session's upload. Pure and
 * separate from `uploadVideo`/`getAuthorizedClient` so it's testable
 * without touching the network or OAuth — same split as
 * `buildConcatFileContent`/`stitchSession` in stitch.ts.
 */
export function buildVideoMetadata(
  entry: TitleMapEntry,
  defaultPrivacyStatus: PrivacyStatus,
): VideoMetadata {
  return {
    snippet: {
      title: entry.title,
      description: entry.description,
      tags: entry.tags,
    },
    status: {
      privacyStatus: entry.privacyStatus ?? defaultPrivacyStatus,
    },
  };
}

interface ClientSecretCredentials {
  clientId: string;
  clientSecret: string;
}

interface ClientSecretFile {
  installed?: { client_id?: string; client_secret?: string };
  web?: { client_id?: string; client_secret?: string };
}

async function loadClientSecret(path: string): Promise<ClientSecretCredentials> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as ClientSecretFile;
  const creds = parsed.installed ?? parsed.web;
  if (!creds?.client_id || !creds.client_secret) {
    throw new Error(
      `Client secret file at ${path} doesn't look like a Google OAuth "Desktop app" client secret JSON`,
    );
  }
  return { clientId: creds.client_id, clientSecret: creds.client_secret };
}

async function loadCachedCredentials(tokenPath: string): Promise<Credentials | null> {
  try {
    const raw = await readFile(tokenPath, "utf8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

async function saveCredentials(tokenPath: string, credentials: Credentials): Promise<void> {
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

/**
 * Runs the OAuth "installed app" consent flow via a loopback redirect:
 * prints a consent URL, waits for the browser redirect on a short-lived
 * 127.0.0.1-only HTTP server, then exchanges the code for tokens.
 */
async function runConsentFlow(client: OAuth2Client, scopes: string[]): Promise<void> {
  const server = createServer();

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Failed to bind local OAuth callback server"));
        return;
      }
      resolve(address.port);
    });
  });

  const redirectUri = `http://127.0.0.1:${port}`;
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    redirect_uri: redirectUri,
  });

  console.log("Open this URL in a browser to authorize camcorder-stitcher with YouTube:");
  console.log(authUrl);

  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for YouTube OAuth consent (5 minutes)"));
    }, CONSENT_TIMEOUT_MS);

    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      const authCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.setHeader("Content-Type", "text/plain");

      if (error) {
        res.end(`Authorization failed: ${error}. You can close this tab.`);
        clearTimeout(timeout);
        server.close();
        reject(new Error(`YouTube OAuth consent failed: ${error}`));
        return;
      }
      if (!authCode) {
        res.end("No authorization code received.");
        return;
      }

      res.end("Authorization complete. You can close this tab and return to the terminal.");
      clearTimeout(timeout);
      server.close();
      resolve(authCode);
    });
  });

  const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
  client.setCredentials(tokens);
}

export interface AuthorizeOptions {
  clientSecretPath: string;
  tokenPath?: string;
  /** OAuth scopes this run needs; a cached token missing any is re-consented. */
  scopes: string[];
}

function hasRequiredScopes(grantedScope: string | null | undefined, required: string[]): boolean {
  if (!grantedScope) {
    return false;
  }
  const granted = new Set(grantedScope.split(" "));
  return required.every((scope) => granted.has(scope));
}

/**
 * Returns an OAuth2Client authorized for the requested scopes, reusing a
 * cached refresh token from a previous run when it already covers those
 * scopes, and otherwise running the interactive consent flow (which
 * transparently widens a previously-narrower grant, e.g. adding playlist
 * access on top of an existing upload-only token).
 */
export async function getAuthorizedClient(options: AuthorizeOptions): Promise<OAuth2Client> {
  const tokenPath = options.tokenPath ?? join(defaultConfigDir(), "youtube-token.json");
  const { clientId, clientSecret } = await loadClientSecret(options.clientSecretPath);

  const client = new OAuth2Client({ clientId, clientSecret });

  const cached = await loadCachedCredentials(tokenPath);
  const cachedIsSufficient = Boolean(cached?.refresh_token) && hasRequiredScopes(cached?.scope, options.scopes);

  if (cachedIsSufficient && cached) {
    client.setCredentials(cached);
  } else {
    await runConsentFlow(client, options.scopes);
    await saveCredentials(tokenPath, client.credentials);
  }

  client.on("tokens", (tokens) => {
    void saveCredentials(tokenPath, { ...client.credentials, ...tokens });
  });

  return client;
}

export interface UploadResult {
  videoId: string;
  url: string;
}

/**
 * Uploads a stitched file to YouTube via the Data API v3. Not covered by
 * automated tests: it requires a live Google account and consumes real
 * upload quota, unlike the ffmpeg integration test which can at least
 * self-skip against a local binary.
 */
export async function uploadVideo(
  auth: OAuth2Client,
  filePath: string,
  metadata: VideoMetadata,
): Promise<UploadResult> {
  const youtube = youtubeClient({ version: "v3", auth });
  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: metadata,
    media: {
      body: createReadStream(filePath),
    },
  });

  const videoId = response.data.id;
  if (!videoId) {
    throw new Error("YouTube upload succeeded but the response had no video id");
  }
  return { videoId, url: `https://youtu.be/${videoId}` };
}

/**
 * Adds an already-uploaded video to a playlist. Not covered by automated
 * tests, same reasoning as `uploadVideo` — needs a live account/quota.
 */
export async function addVideoToPlaylist(
  auth: OAuth2Client,
  playlistId: string,
  videoId: string,
): Promise<void> {
  const youtube = youtubeClient({ version: "v3", auth });
  await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    },
  });
}
