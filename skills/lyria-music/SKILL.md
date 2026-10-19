---
name: lyria-music
description: Generate music, instrumental soundtracks, or songs with lyrics using lyria-cli and Google Lyria, including prompt preparation and structured result handling. Use for creating audio files, not live music streaming or editing existing audio.
---

# Generate music with lyria-cli

Turn the user's musical brief into a prompt, invoke the installed CLI, and return the saved audio path. If the user requests only a prompt or advice, provide that without generating audio.

## Prepare the request

Preserve the user's requested style, lyrics, language, duration, and output destination. Use reasonable musical defaults for unspecified details; clarify only choices that materially change the requested result.

Read [references/prompting.md](references/prompting.md) when composing or refining the music prompt. Put musical directions in the prompt; the CLI has no `--bpm`, `--duration`, `--lyrics`, or `--instrumental` flags.

Choose the model according to the brief:

| Model | Use |
| --- | --- |
| `lyria-3.5` (default) | Songs and flexible musical structure; duration is guided by the prompt |
| `lyria-3-clip-preview` | Fixed 30-second clips |

These are the documented models in Google's [music generation guide](https://ai.google.dev/gemini-api/docs/music-generation). This CLI uses `generateContent`, supports text input and one MP3 output, and has no image input, WAV selection, continuation, audio editing, or Lyria RealTime support. Do not infer CLI options from features in Google's SDK examples.

## Locate the CLI and credentials

Use the available installation:

- Project dependency: `./node_modules/.bin/lyria-cli` from the consuming project root.
- Global installation: `lyria-cli` on `PATH`.
- Source checkout: `node dist/cli.js` from the CLI repository root after building.

The skill may be installed separately from the executable. If the CLI is absent, explain that it needs to be installed; do not assume the skill folder contains a built executable. Once the package is published, `npm install @crapthings/lyria-cli` installs the project dependency. Use `--help` to check the installed command's options.

Check that `GEMINI_API_KEY` is nonempty in the invoking environment without printing its value. A variable assigned in `.zshrc` may not be exported or loaded in an agent shell. The CLI does not automatically load `.env` files. Resolve missing credentials before requesting generation; never embed the key in a command argument or prompt.

## Generate a file

Choose a meaningful, unused `.mp3` destination in the user's workspace and create its parent directory if needed. Prefer a UTF-8 prompt file for multiline lyrics or shell-sensitive text, using the available file-writing tool to preserve the prompt literally. Pass paths as separate arguments when a process API is available; quote paths in shell commands.

For a project dependency:

```sh
./node_modules/.bin/lyria-cli generate \
  --prompt-file ./music/brief.txt \
  --output ./music/theme.mp3 \
  --model lyria-3.5 \
  --timeout 300 \
  --json
```

Use exactly one of `--prompt`, `--prompt-file`, or piped stdin; `--prompt-file -` also reads stdin. Existing outputs are protected. Choose a new name for a variation; use `--overwrite` only when replacing that file is part of the user's request.

A request to create music authorizes the requested generation. Do not generate extra alternatives or run paid smoke tests merely to check installation. The CLI makes one attempt; do not add a retry loop. A timeout or cancellation may still leave provider processing underway, so explain that uncertainty before submitting a replacement unless retries are already authorized.

## Interpret the result

Capture stdout and stderr separately. With `--json`, stdout contains one result object; stderr contains progress. A completed process with exit code `0` and `ok: true` reports `files[]` entries containing `path`, `mimeType`, and `bytes`, plus optional descriptive content in `text`.

Return a clickable audio path when supported, and identify the model and any relevant returned lyrics or description. Only claim that generation and file saving succeeded; do not claim to have listened to the track or verified its musical quality, exact duration, or seamless looping without inspecting the audio.

On failure, report `error.code` and `error.message`:

- `INVALID_ARGUMENT`, `MISSING_API_KEY`: fix the input or environment before another request.
- `OUTPUT_EXISTS`, `FILE_ERROR`: resolve the path or permissions; do not blindly regenerate after a post-generation write failure.
- `AUTH_ERROR`, `RATE_LIMITED`, `API_ERROR`: explain the access, quota, or service failure and stop automatic attempts.
- `TIMEOUT`, `CANCELLED`, `GENERATION_FAILED`: report the incomplete result and avoid assuming the provider did no work.
- `CONTENT_BLOCKED`, `GENERATION_REJECTED`, `NO_AUDIO`, `INVALID_AUDIO`, `UNSUPPORTED_AUDIO`, `MULTIPLE_AUDIO`: no successful output was saved; explain the returned failure before changing the request.

Exit codes are `1` for generation/output failures, `2` for input/credential errors, and `130` for cancellation. Do not parse a failed result as an audio path.
