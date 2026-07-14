# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Node.js/TypeScript CLI that detects camcorder clips split by file-size
limits (e.g. `MOV001.MP4`, `MOV002.MP4`, `MOV003.MP4`) and stitches each
recording session back into one continuous file via `ffmpeg`. See
`README.md` for user-facing usage.

## Commands

- `npm run build` — compile `src/` to `dist/` (`tsc -p tsconfig.json`)
- `npm run dev -- <dir> [flags]` — run the CLI from source via `tsx`, no build step
- `npm test` — run the full Vitest suite once
- `npm run test:watch` — Vitest in watch mode
- Single test file: `npx vitest run test/group.test.ts`
- Single test by name: `npx vitest run -t "splits a session when"`
- `npm run lint` — ESLint (flat config in `eslint.config.js`)
- `npm run typecheck` — `tsc --noEmit`

`ffmpeg` must be installed and on `PATH` to actually stitch files; it is not
bundled as an npm dependency. Grouping/discovery logic has no runtime
dependency on ffmpeg being present, so it stays unit-testable without it.

## Architecture

The pipeline is three pure-ish stages wired together by `src/cli.ts`:

1. **`src/discover.ts`** — non-recursively scans a directory for video files
   (`DEFAULT_VIDEO_EXTENSIONS`) and returns `ClipFile[]` (path, name, mtime).
   Also owns `parseClipName`, which splits a filename into `{ prefix,
   sequence, ext }` by matching the *trailing* digit run before the
   extension (e.g. `VID_20230101_0007.MP4` -> prefix `vid_20230101_`,
   sequence `7`). Filenames without a trailing number return `null`.

2. **`src/group.ts`** (`groupClips`) — the core session-detection logic, and
   the part most worth understanding before changing behavior. Clips are
   sorted by `(prefix, ext)` then sequence number; a run of clips folds into
   one `Session` only while sequence numbers stay contiguous (`n`, `n+1`,
   `n+2`, ...) **and** the gap between consecutive mtimes stays within
   `maxGapSeconds` (default `DEFAULT_MAX_GAP_SECONDS = 120`). Both
   conditions are heuristics standing in for "the camcorder was still
   recording continuously" — there's no ffprobe/duration check, by design,
   to keep this stage fast and dependency-free. Unparseable filenames become
   singleton sessions. Final sessions are sorted by their first clip's
   mtime.

3. **`src/stitch.ts`** (`stitchSession`) — writes an ffmpeg concat-demuxer
   list file to a temp dir and shells out via `fluent-ffmpeg` with `-c copy`
   (stream copy, no re-encode). This is only correct when every clip in a
   session shares the same codec/container, which holds for clips split by
   a camcorder's own file-size limit but not for arbitrary unrelated videos.
   `buildConcatFileContent` (the list-file formatting incl. quote-escaping)
   is factored out as a pure function so it's testable without invoking
   ffmpeg.

`src/cli.ts` wires these together with `commander` and is the only place
that touches `process.exitCode`/stdout formatting. `src/index.ts` re-exports
the same pieces for programmatic/library use.

### Key invariant when changing grouping logic

`groupClips` is pure (no fs/ffmpeg access) specifically so its session-
boundary rules can be tested with fabricated `ClipFile` objects (see
`test/group.test.ts`) instead of real files and real time gaps. Keep any
new grouping heuristic in that function signature-compatible and free of
I/O so this stays true.
