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

The public npm package is `@crapthings/lyria-cli`, under the `crapthings` account; the installed executable remains `lyria-cli`. Log in to npm as an account with access to that scope using `npm login`, then commit your changes before a real release. Version lookup uses this scoped package only.

```sh
npm run release -- --dry-run  # Validate the next version without publishing
npm run release              # Increment patch, publish, commit, tag, and push
npm run release -- minor     # Increment minor instead
npm run release -- major     # Increment major instead
npm run release -- prerelease --preid beta --tag next
```

The default increment is patch. The command queries npm and increments from the higher of the local version and the highest published stable version: local `0.1.0` plus published `0.1.1` produces `0.1.2`. Numeric semver ordering handles versions such as `0.1.9` and `0.1.10`. Prereleases also consider the highest published version in the chosen `--preid` channel, without letting an unrelated channel advance the stable release. Semver rules handle minor, major, and prerelease increments; prereleases use the `next` dist-tag unless overridden with `--tag`. Use `--no-push` to publish and keep the release commit/tag local. `npm run release -- --help` lists all options.

A real release requires a clean Git working tree, a branch (not detached HEAD), a Git identity, and npm authentication. It runs type/comment checks and the full test suite, stages the npm allowlist in a temporary directory, queries published versions, sets the next unused staged version, and verifies the packed CLI and skill files. It publishes that exact tarball publicly, then updates `package.json`, creates a release commit and annotated `vX.Y.Z` tag, and pushes both atomically to `origin`. The pnpm lockfile has no root package version and needs no version-only change.

Both real releases and dry-runs require a successful registry lookup; only an explicit npm `E404` means a first publication. Network or authentication errors stop version planning.

Dry-run runs checks, builds and packs the incremented candidate, and calls `npm publish --dry-run`. It accepts uncommitted work, skips authentication preflight, and leaves tracked files, Git commits/tags, and the registry unchanged. Ignored build outputs may be refreshed. The real release uses the same staged artifact path with lifecycle scripts disabled because validation already built the output.

On a failed check or confirmed publish rejection, the local version stays unchanged. An interrupted publish response can be ambiguous: check npm before retrying. If npm publication succeeds but Git recording/pushing fails, the command reports that publication already happened; finish the version commit, tag, or push manually rather than incrementing and publishing again. Published versions cannot be reused. No automatic publish retries are added by this script.

The release does not create a GitHub Release entry. Compiled files, `docs/`, the complete `skills/` directory, the root README, the license, and package metadata are included in npm; website sources remain in GitHub.

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

The social preview has an editable SVG source. To regenerate its PNG with librsvg installed:

```sh
rsvg-convert website/assets/social.svg -o website/assets/social.png
```
