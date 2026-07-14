import { readFile } from "node:fs/promises";
import type { PrivacyStatus, TitleMap, TitleMapEntry } from "./types.js";

const VALID_PRIVACY_STATUSES: readonly PrivacyStatus[] = ["private", "unlisted", "public"];

/**
 * Parses and validates the contents of a titles file (session id -> upload
 * metadata). Kept separate from disk I/O so it's testable with fixture
 * strings, same split as `buildConcatFileContent`/`stitchSession`.
 */
export function parseTitleMap(json: string): TitleMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new Error("Titles file is not valid JSON", { cause });
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Titles file must contain a JSON object mapping session id -> metadata");
  }

  const result: TitleMap = {};
  for (const [sessionId, value] of Object.entries(parsed as Record<string, unknown>)) {
    result[sessionId] = parseTitleMapEntry(sessionId, value);
  }
  return result;
}

function parseTitleMapEntry(sessionId: string, value: unknown): TitleMapEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Titles file entry "${sessionId}" must be an object`);
  }
  const entry = value as Record<string, unknown>;

  if (typeof entry.title !== "string" || entry.title.trim() === "") {
    throw new Error(`Titles file entry "${sessionId}" is missing a non-empty "title" string`);
  }

  if (entry.description !== undefined && typeof entry.description !== "string") {
    throw new Error(`Titles file entry "${sessionId}" has a non-string "description"`);
  }

  if (entry.tags !== undefined) {
    const tagsAreValid = Array.isArray(entry.tags) && entry.tags.every((tag) => typeof tag === "string");
    if (!tagsAreValid) {
      throw new Error(`Titles file entry "${sessionId}" has a non-string-array "tags"`);
    }
  }

  if (entry.privacyStatus !== undefined) {
    const isValid = VALID_PRIVACY_STATUSES.includes(entry.privacyStatus as PrivacyStatus);
    if (!isValid) {
      throw new Error(
        `Titles file entry "${sessionId}" has an invalid "privacyStatus" ` +
          `(expected one of ${VALID_PRIVACY_STATUSES.join(", ")})`,
      );
    }
  }

  return {
    title: entry.title,
    description: entry.description as string | undefined,
    tags: entry.tags as string[] | undefined,
    privacyStatus: entry.privacyStatus as PrivacyStatus | undefined,
  };
}

export async function loadTitleMap(path: string): Promise<TitleMap> {
  const content = await readFile(path, "utf8");
  return parseTitleMap(content);
}
