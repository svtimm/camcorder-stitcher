export { discoverClips, parseClipName, DEFAULT_VIDEO_EXTENSIONS } from "./discover.js";
export { groupClips, DEFAULT_MAX_GAP_SECONDS } from "./group.js";
export { stitchSession, buildConcatFileContent } from "./stitch.js";
export { loadTitleMap, parseTitleMap } from "./titles.js";
export { buildVideoMetadata, defaultConfigDir, getAuthorizedClient, uploadVideo } from "./youtube.js";
export type { ClipFile, GroupOptions, ParsedClipName, Session } from "./types.js";
export type { PrivacyStatus, TitleMap, TitleMapEntry, VideoMetadata } from "./types.js";
