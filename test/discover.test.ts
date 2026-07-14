import { describe, expect, it } from "vitest";
import { parseClipName } from "../src/discover.js";

describe("parseClipName", () => {
  it("extracts prefix, sequence, and extension", () => {
    expect(parseClipName("MOV003.MP4")).toEqual({
      prefix: "mov",
      sequence: 3,
      ext: ".mp4",
    });
  });

  it("handles underscore-delimited camcorder naming", () => {
    expect(parseClipName("MVI_0002.MP4")).toEqual({
      prefix: "mvi_",
      sequence: 2,
      ext: ".mp4",
    });
  });

  it("uses the trailing digit run when a name has several", () => {
    expect(parseClipName("VID_20230101_0007.MP4")).toEqual({
      prefix: "vid_20230101_",
      sequence: 7,
      ext: ".mp4",
    });
  });

  it("returns null when there is no trailing sequence number", () => {
    expect(parseClipName("holiday-highlights.mp4")).toBeNull();
  });
});
