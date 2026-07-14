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

## Using a cloud-synced folder (Google Drive, Dropbox, etc.)

This works the same as any local directory — point `<dir>` at wherever your
sync client (Google Drive for Desktop, rclone mount, etc.) exposes "My
Drive" on disk, e.g.:

```bash
node dist/cli.js "/Users/you/Google Drive/My Drive/Camcorder Footage" --dry-run
```

Two things to double check for a synced folder specifically:

- **File timestamps.** Grouping relies on each clip's mtime to detect gaps
  between recording sessions. Whether a synced copy preserves the clip's
  *original* mtime, or resets it to sync/upload time, depends on how the
  files got into Drive in the first place. Always run `--dry-run` first,
  and if the detected sessions look wrong, check a clip's actual mtime
  (`ls -l` / `stat`) against when it was really recorded.
- **On-demand download.** In Google Drive for Desktop's "Stream" mode,
  files are placeholders fetched on access — reading them still works, but
  can be slow or fail without a network connection.

Also consider pointing `--output-dir` somewhere outside the synced folder,
so stitched output doesn't get re-uploaded through Drive unless you want
it to.

## Uploading to YouTube (optional)

Omit `--titles` and nothing about uploading applies — the tool behaves
exactly as described above. Passing `--titles <file>` additionally uploads
whichever multi-clip sessions appear in that file to YouTube right after
stitching them.

### One-time setup

1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   (or pick) a project and enable the **YouTube Data API v3**.
2. Configure the OAuth consent screen (External is fine for personal use —
   add your own Google account as a test user).
3. Create an **OAuth client ID** of type **Desktop app**, then download its
   JSON.
4. Save it as `~/.config/camcorder-stitcher/client_secret.json` (the
   default the tool looks for), or pass `--client-secret <path>` to point
   elsewhere.

The first upload run opens a consent URL for you to visit in a browser and
captures the redirect automatically on a local, loopback-only server; the
resulting token is cached in `~/.config/camcorder-stitcher/youtube-token.json`
so you won't be asked again on later runs.

### Preparing titles ahead of time

Run `--dry-run` first to see the session ids the tool detects:

```bash
node dist/cli.js /path/to/clips --dry-run
# Session "mov001" (3 clip(s)): MOV001.MP4, MOV002.MP4, MOV003.MP4
```

Then write a JSON file mapping each session id you want uploaded to its
metadata:

```json
{
  "mov001": {
    "title": "Beach Day 2024",
    "description": "Family trip to the beach",
    "tags": ["family", "beach"],
    "privacyStatus": "unlisted"
  }
}
```

Only `title` is required. `privacyStatus` (`private` | `unlisted` | `public`)
defaults to `--privacy-status` (itself defaulting to `unlisted`) when
omitted. Sessions the tool detects but that aren't in this file are still
stitched locally — they're just skipped for upload, with a console note.

You can preview what would be uploaded, with no network calls and no
stitching, by combining both flags:

```bash
node dist/cli.js /path/to/clips --dry-run --titles titles.json
```

Then run for real:

```bash
node dist/cli.js /path/to/clips --titles titles.json
```

Note: if the process is interrupted partway through a batch, already-
uploaded sessions aren't tracked — re-running will stitch and attempt to
upload every session in the titles file again.
