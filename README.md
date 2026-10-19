# lyria-cli

Generate music with Google Lyria from your terminal or an AI agent. Text in, MP3 out, with JSON results for automation.

[Website](https://crapthings.github.io/lyria-cli/) · [GitHub](https://github.com/crapthings/lyria-cli)

## Quick start

Requires Node.js 22+ and a [Gemini API key](https://aistudio.google.com/apikey). After the first npm release:

```sh
npm install -g lyria-cli
export GEMINI_API_KEY='your-api-key'

lyria-cli generate \
  --prompt 'Gentle jazz piano and upright bass, no vocals' \
  --output ./music.mp3 \
  --json
```

Use `--prompt-file ./song.txt` for lyrics or long prompts. Run `lyria-cli --help` for all options. Default model: `lyria-3.5`.

## Agent skill

The npm package includes [lyria-music](skills/lyria-music/SKILL.md). After a project-local `npm install lyria-cli`, register it with your agent:

```sh
npx skills add ./node_modules/lyria-cli/skills/lyria-music
```

From this checkout, use `npx skills add ./skills/lyria-music`. You can also install from GitHub with `npx skills add crapthings/lyria-cli --skill lyria-music`. Installing the skill does not install the CLI or API credentials.

## Development

```sh
pnpm install
pnpm check
pnpm test
node dist/cli.js --help
```

[CLI reference](docs/cli.md) · [Development, releases & GitHub Pages](docs/development.md)

MIT
