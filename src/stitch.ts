import ffmpeg from "fluent-ffmpeg";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session } from "./types.js";

/**
 * Builds the contents of an ffmpeg "concat demuxer" list file from a
 * session's clips, in playback order. Paths are escaped per the demuxer's
 * quoting rules (single-quoted, with embedded quotes escaped).
 */
export function buildConcatFileContent(session: Session): string {
  return session.clips
    .map((clip) => `file ${escapeConcatPath(clip.path)}`)
    .join("\n");
}

function escapeConcatPath(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

/**
 * Stitches a session's clips into a single output file using ffmpeg's
 * concat demuxer with stream copy (no re-encoding). This only produces a
 * clean result when all clips in the session share the same codec/format,
 * which holds for camcorder output split by file-size limits.
 */
export async function stitchSession(session: Session, outputPath: string): Promise<void> {
  if (session.clips.length === 0) {
    throw new Error(`Session "${session.id}" has no clips to stitch`);
  }
  if (session.clips.length === 1) {
    throw new Error(
      `Session "${session.id}" has only one clip; nothing to stitch (copy it manually if needed)`,
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), "camcorder-stitcher-"));
  const listPath = join(workDir, "concat.txt");
  await writeFile(listPath, buildConcatFileContent(session), "utf8");

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy"])
        .on("error", reject)
        .on("end", () => resolve())
        .save(outputPath);
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
