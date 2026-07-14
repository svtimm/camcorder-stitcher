import { describe, expect, it } from "vitest";
import { buildVideoMetadata } from "../src/youtube.js";
import type { TitleMapEntry } from "../src/types.js";

describe("buildVideoMetadata", () => {
  it("builds a request body from a full title map entry", () => {
    const entry: TitleMapEntry = {
      title: "Beach Day 2024",
      description: "Family trip to the beach",
      tags: ["family", "beach"],
      privacyStatus: "public",
    };

    expect(buildVideoMetadata(entry, "unlisted")).toEqual({
      snippet: {
        title: "Beach Day 2024",
        description: "Family trip to the beach",
        tags: ["family", "beach"],
      },
      status: { privacyStatus: "public" },
    });
  });

  it("falls back to the default privacy status when the entry doesn't set one", () => {
    const entry: TitleMapEntry = { title: "Birthday Party" };

    expect(buildVideoMetadata(entry, "unlisted")).toEqual({
      snippet: { title: "Birthday Party", description: undefined, tags: undefined },
      status: { privacyStatus: "unlisted" },
    });
  });
});
