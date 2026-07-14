# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Node.js/TypeScript CLI that detects camcorder clips split by file-size
limits (e.g. `MOV001.MP4`, `MOV002.MP4`, `MOV003.MP4`) and stitches each
recording session back into one continuous file via `ffmpeg`. See
`README.md` for user-facing usage.

## Commands

This project uses **pnpm** (pinned via `packageManager` in `package.json`;
`corepack enable` picks up the right version automatically) — not npm or
yarn. Always install with `pnpm install`, which produces `pnpm-lock.yaml`;
don't run plain `npm install` here, it would generate a conflicting
`package-lock.json`.

- `pnpm install` — install dependencies
- `pnpm run build` — compile `src/` to `dist/` (`tsc -p tsconfig.build.json`)
- `pnpm run dev <dir> [flags]` — run the CLI from source via `tsx`, no build step.
  Pass args directly with no `--` separator — pnpm (unlike npm) forwards a
  literal `--` token into the invoked command, which commander misparses as
  "end of options", swallowing subsequent flags like `--dry-run` as positionals.
- `pnpm test` — run the full Vitest suite once
- `pnpm run test:watch` — Vitest in watch mode
- Single test file: `pnpm exec vitest run test/group.test.ts`
- Single test by name: `pnpm exec vitest run -t "splits a session when"`
- `pnpm run lint` — ESLint (flat config in `eslint.config.js`)
- `pnpm run typecheck` — `tsc --noEmit` against `tsconfig.json` (covers `src` **and** `test`)

`ffmpeg` must be installed and on `PATH` to actually stitch files; it is not
bundled as an npm dependency (macOS: `brew install ffmpeg`). Grouping/
discovery logic has no runtime dependency on ffmpeg being present, so it
stays unit-testable without it. `test/stitch.integration.test.ts` does
exercise real ffmpeg (generates tiny clips with `ffmpeg -f lavfi` and stitches
them) but self-skips via `describe.skipIf` when `ffmpeg` isn't on `PATH` —
expect it to run in CI and on any machine with ffmpeg installed, and to skip
silently otherwise (e.g. in this sandbox).

### Two tsconfigs, on purpose

`tsconfig.json` is the "typecheck everything" config (`noEmit: true`,
includes `src` + `test`) — both `pnpm run typecheck` and editor tooling use
it. `tsconfig.build.json` extends it and narrows `include` to `src` only,
turning emission back on with `rootDir`/`outDir`/`declaration` set, for
`pnpm run build`. Don't merge these back into one config: doing so either
stops `test/` from being typechecked or leaks compiled test files into
`dist/`.

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

## Cross-platform notes

CI (`.github/workflows/ci.yml`) runs the full pipeline (typecheck, lint,
test, build) on both `ubuntu-latest` and `macos-latest` for every push/PR —
that's the real signal for "does this work on Mac", not local assumptions.
The codebase itself has no platform-specific branches (no `process.platform`
checks, no hardcoded path separators); all path/temp-dir/fs work goes
through `node:path`, `node:os`, and `node:fs/promises`, and extension/prefix
matching in `discover.ts`/`group.ts` is lower-cased so it's stable across
case-insensitive (macOS/Windows) and case-sensitive (Linux) filesystems. If
you add anything that shells out or touches paths directly, keep it that
way rather than assuming POSIX-only behavior.

This same portability is why nothing in `discover.ts`/`stitch.ts` needs to
change to point `<dir>` at a locally-synced cloud folder (Google Drive for
Desktop, rclone mount, etc.) instead of a physical drive — it's just
another directory as far as `readdir`/`stat`/ffmpeg are concerned. The one
thing that *does* travel with the storage backend is mtime trustworthiness:
`groupClips`'s gap heuristic (see above) is only as good as the mtimes it's
handed, and a sync client may or may not preserve a clip's original
recording mtime through upload/sync. See the "cloud-synced folder" section
in `README.md` for the user-facing caveat.
