import { describe, expect, it } from "vitest";
import { groupClips } from "../src/group.js";
import type { ClipFile } from "../src/types.js";

const MINUTE = 60_000;

function clip(name: string, mtimeMs: number): ClipFile {
  return { path: `/clips/${name}`, name, mtimeMs };
}

describe("groupClips", () => {
  it("merges contiguous, closely-timed clips into one session", () => {
    const clips = [
      clip("MOV001.MP4", 0),
      clip("MOV002.MP4", 1 * MINUTE),
      clip("MOV003.MP4", 2 * MINUTE),
    ];

    const sessions = groupClips(clips, { maxGapSeconds: 120 });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.clips.map((c) => c.name)).toEqual([
      "MOV001.MP4",
      "MOV002.MP4",
      "MOV003.MP4",
    ]);
  });

  it("splits a session when the mtime gap exceeds the threshold", () => {
    const clips = [
      clip("MOV001.MP4", 0),
      clip("MOV002.MP4", 1 * MINUTE),
      // recording resumed an hour later
      clip("MOV003.MP4", 61 * MINUTE),
    ];

    const sessions = groupClips(clips, { maxGapSeconds: 120 });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.clips.map((c) => c.name)).toEqual(["MOV001.MP4", "MOV002.MP4"]);
    expect(sessions[1]!.clips.map((c) => c.name)).toEqual(["MOV003.MP4"]);
  });

  it("splits a session when the sequence number is not contiguous", () => {
    const clips = [clip("MOV001.MP4", 0), clip("MOV003.MP4", 1 * MINUTE)];

    const sessions = groupClips(clips, { maxGapSeconds: 120 });

    expect(sessions).toHaveLength(2);
  });

  it("keeps clips from different naming prefixes in separate sessions", () => {
    const clips = [clip("MOV001.MP4", 0), clip("MVI_0001.MP4", 1 * MINUTE)];

    const sessions = groupClips(clips, { maxGapSeconds: 120 });

    expect(sessions).toHaveLength(2);
  });

  it("gives unparseable filenames their own single-clip session", () => {
    const clips = [clip("holiday-highlights.mp4", 0), clip("MOV001.MP4", 1 * MINUTE)];

    const sessions = groupClips(clips, { maxGapSeconds: 120 });

    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.clips.length)).toEqual([1, 1]);
  });

  it("orders sessions by their earliest clip's mtime", () => {
    const clips = [
      clip("MVI_0001.MP4", 5 * MINUTE),
      clip("MOV001.MP4", 0),
    ];

    const sessions = groupClips(clips, { maxGapSeconds: 120 });

    expect(sessions.map((s) => s.id)).toEqual(["mov001", "mvi_001"]);
  });
});
