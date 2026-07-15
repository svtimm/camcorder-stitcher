export { discoverClips, parseClipName, DEFAULT_VIDEO_EXTENSIONS } from "./discover.js";
export { groupClips, DEFAULT_MAX_GAP_SECONDS } from "./group.js";
export { stitchSession, buildConcatFileContent } from "./stitch.js";
export { loadTitleMap, parseTitleMap } from "./titles.js";
export {
  addVideoToPlaylist,
  buildVideoMetadata,
  defaultConfigDir,
  getAuthorizedClient,
  uploadVideo,
  YOUTUBE_PLAYLIST_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
} from "./youtube.js";
export type { ClipFile, GroupOptions, ParsedClipName, Session } from "./types.js";
export type { PrivacyStatus, TitleMap, TitleMapEntry, VideoMetadata } from "./types.js";
