import { describe, expect, it } from "vitest";
import { buildConcatFileContent } from "../src/stitch.js";
import type { Session } from "../src/types.js";

describe("buildConcatFileContent", () => {
  it("lists clips in order using ffmpeg concat demuxer syntax", () => {
    const session: Session = {
      id: "mov001",
      clips: [
        { path: "/clips/MOV001.MP4", name: "MOV001.MP4", mtimeMs: 0 },
        { path: "/clips/MOV002.MP4", name: "MOV002.MP4", mtimeMs: 1 },
      ],
    };

    expect(buildConcatFileContent(session)).toBe(
      "file '/clips/MOV001.MP4'\nfile '/clips/MOV002.MP4'",
    );
  });

  it("escapes single quotes in paths", () => {
    const session: Session = {
      id: "mov001",
      clips: [{ path: "/clips/Bob's Camcorder/MOV001.MP4", name: "MOV001.MP4", mtimeMs: 0 }],
    };

    expect(buildConcatFileContent(session)).toBe(
      "file '/clips/Bob'\\''s Camcorder/MOV001.MP4'",
    );
  });
});
