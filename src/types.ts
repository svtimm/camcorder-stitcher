export interface ClipFile {
  /** Absolute path to the clip on disk. */
  path: string;
  /** File name only, e.g. "MOV003.MP4". */
  name: string;
  /** Last-modified time, used as a proxy for "recording finished at". */
  mtimeMs: number;
}

export interface ParsedClipName {
  /** Everything before the trailing sequence number, lower-cased. */
  prefix: string;
  /** Trailing numeric sequence extracted from the filename. */
  sequence: number;
  /** File extension including the leading dot, lower-cased. */
  ext: string;
}

export interface Session {
  /** Stable id derived from the shared filename prefix/extension. */
  id: string;
  /** Clips belonging to this session, in playback order. */
  clips: ClipFile[];
}

export interface GroupOptions {
  /**
   * Maximum gap, in seconds, between one clip's mtime and the next clip's
   * mtime for them to be considered part of the same recording session.
   * Camcorders write the next file almost immediately after the previous
   * one fills up, so a large gap means recording was stopped and later
   * resumed (or it's an unrelated clip).
   */
  maxGapSeconds: number;
}

export type PrivacyStatus = "private" | "unlisted" | "public";

export interface TitleMapEntry {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: PrivacyStatus;
}

/** Maps a `Session.id` to the metadata that should be used to upload it. */
export type TitleMap = Record<string, TitleMapEntry>;

export interface VideoMetadata {
  snippet: {
    title: string;
    description?: string;
    tags?: string[];
  };
  status: {
    privacyStatus: PrivacyStatus;
  };
}
