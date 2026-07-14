import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stitchSession } from "../src/stitch.js";
import type { Session } from "../src/types.js";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe.skipIf(!hasFfmpeg)("stitchSession (real ffmpeg)", () => {
  let workDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "camcorder-stitcher-it-"));
    for (const name of ["MOV001.MP4", "MOV002.MP4"]) {
      execFileSync("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=32x32:d=1:r=10",
        "-pix_fmt",
        "yuv420p",
        join(workDir, name),
      ]);
    }
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("concatenates two real clips into one playable output", async () => {
    const session: Session = {
      id: "mov001",
      clips: [
        { path: join(workDir, "MOV001.MP4"), name: "MOV001.MP4", mtimeMs: 0 },
        { path: join(workDir, "MOV002.MP4"), name: "MOV002.MP4", mtimeMs: 1000 },
      ],
    };
    const outputPath = join(workDir, "stitched.mp4");

    await stitchSession(session, outputPath);

    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(0);
  });
});
