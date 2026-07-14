# camcorder-stitcher

A CLI that detects camcorder clips split by file-size limits (e.g. `MOV001.MP4`,
`MOV002.MP4`, `MOV003.MP4`) and stitches each recording session back into one
continuous video file.

Many camcorders and DVRs split a single recording into multiple files once a
file-size or duration limit is hit. This tool scans a directory, figures out
which files belong to the same recording session (by filename sequence number
and how close together their timestamps are), and concatenates each session
into a single output file with `ffmpeg`.

## Requirements

- Node.js 20+
- pnpm (see `packageManager` in `package.json` for the version; `corepack enable` will pick it up automatically)
- `ffmpeg` available on your `PATH`

On macOS, install ffmpeg with Homebrew:

```bash
brew install ffmpeg
```

## Install

```bash
pnpm install
pnpm run build
```

## Usage

```bash
# Show detected sessions without writing anything
node dist/cli.js /path/to/clips --dry-run

# Stitch each multi-clip session into ./stitched/<session-id>.<ext>
node dist/cli.js /path/to/clips

# Custom output directory and gap tolerance (seconds)
node dist/cli.js /path/to/clips --output-dir ./out --max-gap-seconds 60
```

During development you can skip the build step with:

```bash
pnpm run dev /path/to/clips --dry-run
```

Note: pass args to `pnpm run dev` directly, without a `--` separator — unlike
npm, pnpm forwards a literal `--` token into the command, which confuses
commander's argument parsing.

## How grouping works

1. Scan the target directory (non-recursively) for video files.
2. Parse each filename's trailing digit run as a sequence number, and
   everything before it (plus the extension) as a naming key, e.g.
   `MVI_0002.MP4` -> key `mvi_` + `.mp4`, sequence `2`.
3. Walk clips in order; consecutive clips join the same session when they
   share a naming key, their sequence numbers are contiguous, and the gap
   between their file mtimes is within `--max-gap-seconds` (default 120s).
4. Filenames with no trailing sequence number each become their own
   single-clip session.

Stitching uses ffmpeg's concat demuxer with stream copy (`-c copy`), so it
only produces clean output when all clips in a session share the same
codec/format — true for clips split by a camcorder's own file-size limit,
not for arbitrary unrelated videos.
