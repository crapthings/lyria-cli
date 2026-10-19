# CLI reference


Use `--json` for automated calls. Generation emits exactly one JSON object on stdout, followed by a newline. Progress goes to stderr. Help and version commands always emit plain text. Errors omit raw provider messages and credentials.

Successful generation exits with code `0` after the complete audio file has been saved:

```json
{
  "ok": true,
  "model": "lyria-3.5",
  "files": [
    {
      "path": "/absolute/path/music.mp3",
      "mimeType": "audio/mpeg",
      "bytes": 123456
    }
  ],
  "text": "Any lyrics or song description returned by the model."
}
```

Failures return a nonzero exit code:

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "API quota or rate limit exceeded."
  }
}
```

| Exit code | Meaning |
| --- | --- |
| `0` | Success, help, or version |
| `1` | API, output, timeout, or generation failure |
| `2` | Invalid arguments, empty prompt, or missing API key |
| `130` | Cancelled by SIGINT or SIGTERM |

Stable error codes: `INVALID_ARGUMENT`, `MISSING_API_KEY`, `AUTH_ERROR`, `RATE_LIMITED`, `API_ERROR`, `GENERATION_FAILED`, `CONTENT_BLOCKED`, `GENERATION_REJECTED`, `NO_AUDIO`, `INVALID_AUDIO`, `UNSUPPORTED_AUDIO`, `MULTIPLE_AUDIO`, `OUTPUT_EXISTS`, `FILE_ERROR`, `TIMEOUT`, `CANCELLED`.

## Options and behavior

| Option | Default | Behavior |
| --- | --- | --- |
| `--prompt <text>` | — | Prompt supplied directly |
| `--prompt-file <path>` | — | UTF-8 file, or `-` for stdin |
| `--output <path>` | `music.mp3` | Output path; parent directory must exist |
| `--model <id>` | `lyria-3.5` | Compatible Gemini music model |
| `--timeout <seconds>` | `300` | Generation deadline; positive fractional seconds supported |
| `--overwrite` | off | Replace an existing regular file |
| `--json` | off | Structured success and error output |

Use exactly one explicit prompt source. When neither prompt option is present, the CLI reads piped stdin. Empty or whitespace-only prompts are rejected.

This release requests audio and text through `generateContent`, waits for the complete response, and supports one MP3 track per invocation. It processes all parts in the first candidate and refuses ambiguous multiple audio parts rather than joining separate files. Output paths must end in `.mp3`; no transcoding is performed. Temporary files are written beside the destination, then published atomically; an output created by another writer is protected unless `--overwrite` is set.

Duration, instruments, style, vocals, and lyrics belong in the prompt. Duration is a model instruction, not a CLI guarantee. See Google's [music generation documentation](https://ai.google.dev/gemini-api/docs/generate-content/music-generation).

No generation request is automatically retried. Timeout or cancellation stops the local request; it cannot guarantee that the provider has stopped processing or charging for it. Account for this before submitting a replacement request.

