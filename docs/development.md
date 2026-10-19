# Development


```sh
pnpm install
pnpm check
pnpm test
node dist/cli.js --help
```

Tests use a fake HTTP response through the actual SDK and executable; they require no API key or paid generation. A real generation smoke test requires your own key and is not part of the automated suite.

```text
src/
  cli.ts       Command lifecycle, signals, and result reporting
  options.ts   Argument validation and prompt input
  generate.ts  Gemini adapter and response validation
  output.ts    Output preflight and atomic publication
  errors.ts    Stable public error mapping
test/
  cli.test.mjs End-to-end executable tests with simulated HTTP responses
  core.test.mjs Response validation and concurrent output tests
  fake-api.mjs Test-only fetch replacement
scripts/
  check-comments.mjs Enforce responsibility comments for top-level declarations
```

Every top-level declaration has a one-sentence responsibility comment. Split declarations whose responsibilities cannot be explained clearly in one sentence. Keep provider behavior in `generate.ts`, filesystem behavior in `output.ts`, and command behavior in `cli.ts`/`options.ts`.

The SDK version is pinned because retry and error behavior are part of this CLI's contract; run the full suite when updating it.

## Release

```sh
pnpm check
pnpm test
npm pack --dry-run
npm pack
# Inspect the tarball and verify installation before publishing.
npm publish --access public
```

`prepack` rebuilds `dist`. Compiled files, `docs/`, the complete `skills/` directory, the root README, the license, and package metadata are included. Confirm the npm package name is available and that the version is correct before publication; change to a scoped name if needed. The GitHub repository is public; the npm package has not been published yet.


## GitHub Pages

The static website lives in `website/`; `npm run build:site` writes `_site/` without installing website dependencies.

```sh
npm run build:site
python3 -m http.server 4173 --directory _site
```

For a production build, set `SITE_URL` to the final public URL, including any repository path. `GITHUB_REPOSITORY=owner/repo` optionally adds source links.

```sh
SITE_URL=https://example.github.io/lyria-cli/ npm run build:site
```

The GitHub Actions workflow reads the public URL from `actions/configure-pages` and builds canonical URLs, Open Graph metadata, JSON-LD, `robots.txt`, and `sitemap.xml`. Relative assets work with both project paths and custom domains. Preview builds omit canonical URLs and sitemaps and use `noindex` so a preview URL cannot become the canonical page.

To configure hosting, select **Settings → Pages → Build and deployment → Source → GitHub Actions**. The workflow deploys pushes to the default branch, and supports manual dispatch. The repository is [crapthings/lyria-cli](https://github.com/crapthings/lyria-cli), and the site URL is https://crapthings.github.io/lyria-cli/.

The website uses no analytics, remote fonts, or API keys. Copy controls are optional enhancements; installation and usage text remains visible without JavaScript.
