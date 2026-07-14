import { describe, expect, it } from "vitest";
import { parseTitleMap } from "../src/titles.js";

describe("parseTitleMap", () => {
  it("parses a valid mapping", () => {
    const json = JSON.stringify({
      mov001: {
        title: "Beach Day 2024",
        description: "Family trip to the beach",
        tags: ["family", "beach"],
        privacyStatus: "public",
      },
      mvi_0007: { title: "Birthday Party" },
    });

    expect(parseTitleMap(json)).toEqual({
      mov001: {
        title: "Beach Day 2024",
        description: "Family trip to the beach",
        tags: ["family", "beach"],
        privacyStatus: "public",
      },
      mvi_0007: { title: "Birthday Party" },
    });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseTitleMap("{ not json")).toThrow(/not valid JSON/);
  });

  it("throws when the top level isn't an object", () => {
    expect(() => parseTitleMap("[1, 2, 3]")).toThrow(/must contain a JSON object/);
  });

  it("throws when an entry is missing a title", () => {
    expect(() => parseTitleMap(JSON.stringify({ mov001: { description: "no title" } }))).toThrow(
      /missing a non-empty "title"/,
    );
  });

  it("throws when an entry's title is empty", () => {
    expect(() => parseTitleMap(JSON.stringify({ mov001: { title: "   " } }))).toThrow(
      /missing a non-empty "title"/,
    );
  });

  it("throws when tags isn't a string array", () => {
    expect(() => parseTitleMap(JSON.stringify({ mov001: { title: "x", tags: [1, 2] } }))).toThrow(
      /non-string-array "tags"/,
    );
  });

  it("throws on an invalid privacyStatus", () => {
    expect(() =>
      parseTitleMap(JSON.stringify({ mov001: { title: "x", privacyStatus: "everyone" } })),
    ).toThrow(/invalid "privacyStatus"/);
  });
});
