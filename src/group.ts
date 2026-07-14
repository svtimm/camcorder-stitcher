import { parseClipName } from "./discover.js";
import type { ClipFile, GroupOptions, Session } from "./types.js";

export const DEFAULT_MAX_GAP_SECONDS = 120;

interface Keyed {
  clip: ClipFile;
  prefix: string;
  ext: string;
  sequence: number;
}

/**
 * Groups clips into recording sessions.
 *
 * Two consecutive clips (by filename sequence number) are folded into the
 * same session when they share a filename prefix/extension, their sequence
 * numbers are contiguous, and the gap between their mtimes is within
 * `maxGapSeconds`. Files whose name has no trailing sequence number each
 * become their own single-clip session, ordered by mtime.
 */
export function groupClips(clips: ClipFile[], options: GroupOptions): Session[] {
  const keyed: Keyed[] = [];
  const unkeyed: ClipFile[] = [];

  for (const clip of clips) {
    const parsed = parseClipName(clip.name);
    if (parsed) {
      keyed.push({ clip, prefix: parsed.prefix, ext: parsed.ext, sequence: parsed.sequence });
    } else {
      unkeyed.push(clip);
    }
  }

  keyed.sort((a, b) => {
    const keyCompare = `${a.prefix}${a.ext}`.localeCompare(`${b.prefix}${b.ext}`);
    if (keyCompare !== 0) return keyCompare;
    return a.sequence - b.sequence;
  });

  const sessions: Session[] = [];
  const maxGapMs = options.maxGapSeconds * 1000;
  let current: Keyed[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    sessions.push({
      id: `${first.prefix}${String(first.sequence).padStart(3, "0")}`,
      clips: current.map((k) => k.clip),
    });
    current = [];
  };

  for (const entry of keyed) {
    const prev = current[current.length - 1];
    const continuesRun =
      prev !== undefined &&
      prev.prefix === entry.prefix &&
      prev.ext === entry.ext &&
      entry.sequence === prev.sequence + 1 &&
      entry.clip.mtimeMs - prev.clip.mtimeMs <= maxGapMs;

    if (prev !== undefined && !continuesRun) {
      flush();
    }
    current.push(entry);
  }
  flush();

  for (const clip of unkeyed) {
    sessions.push({ id: clip.name, clips: [clip] });
  }

  sessions.sort((a, b) => a.clips[0]!.mtimeMs - b.clips[0]!.mtimeMs);

  return sessions;
}
