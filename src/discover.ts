import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ClipFile, ParsedClipName } from "./types.js";

/** Extensions camcorders/DVRs commonly write video to. */
export const DEFAULT_VIDEO_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".mts",
  ".m2ts",
  ".avi",
  ".mpg",
  ".mpeg",
];

/**
 * Splits a filename into a shared prefix and a trailing sequence number,
 * e.g. "MVI_0002.MP4" -> { prefix: "mvi_", sequence: 2, ext: ".mp4" }.
 * Returns null when the filename has no trailing digit run to key off of.
 */
export function parseClipName(name: string): ParsedClipName | null {
  const match = name.match(/^(.*?)(\d+)(\.[^./\\]+)$/);
  if (!match) {
    return null;
  }
  const [, prefix, sequence, ext] = match as unknown as [string, string, string, string];
  return {
    prefix: prefix.toLowerCase(),
    sequence: Number.parseInt(sequence, 10),
    ext: ext.toLowerCase(),
  };
}

/**
 * Scans a directory (non-recursively) for video files and returns them
 * with the filesystem metadata `group`/`stitch` need.
 */
export async function discoverClips(
  dir: string,
  extensions: string[] = DEFAULT_VIDEO_EXTENSIONS,
): Promise<ClipFile[]> {
  const allowed = new Set(extensions.map((ext) => ext.toLowerCase()));
  const entries = await readdir(dir, { withFileTypes: true });

  const clips = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .filter((entry) => allowed.has(extname(entry.name)))
      .map(async (entry) => {
        const path = join(dir, entry.name);
        const stats = await stat(path);
        return { path, name: entry.name, mtimeMs: stats.mtimeMs } satisfies ClipFile;
      }),
  );

  return clips;
}

function extname(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx).toLowerCase();
}
