import assert from 'node:assert/strict';
import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildSite, normalizeSiteUrl } from '../scripts/build-site.mjs';

/** Build a site in a disposable directory and pass its HTML to a verification callback. */
async function withSite(options, verify) {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'lyria-site-'));
  try {
    await buildSite({ ...options, outputDirectory });
    await verify(outputDirectory, await readFile(join(outputDirectory, 'index.html'), 'utf8'));
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

// Verify that search and sharing metadata preserve repository subpaths and bundled resources resolve.
test('production site emits consistent canonical, social, schema, and sitemap URLs', async () => {
  await withSite({ siteUrl: 'https://example.github.io/lyria-cli', repository: 'example/lyria-cli' }, async (directory, html) => {
    assert.match(html, /rel="canonical" href="https:\/\/example.github.io\/lyria-cli\/"/);
    assert.match(html, /content="https:\/\/example.github.io\/lyria-cli\/assets\/social.png"/);
    assert.match(html, /href="https:\/\/github.com\/example\/lyria-cli"/);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(schema.url, 'https://example.github.io/lyria-cli/');
    assert.equal(schema['@type'], 'SoftwareApplication');
    assert.match(await readFile(join(directory, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/example.github.io\/lyria-cli\/<\/loc>/);
    assert.match(await readFile(join(directory, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example.github.io\/lyria-cli\/sitemap.xml/);
    for (const path of ['assets/social.png', 'assets/favicon.svg', 'style.css', 'main.js', 'skills/lyria-music/SKILL.md', 'skills/lyria-music/references/prompting.md']) {
      await access(join(directory, path));
    }
    assert.doesNotMatch(html, /<!-- SEO -->|<!-- SOURCE_LINK -->/);
  });
});

// Verify that previews cannot publish a fictitious canonical address or reuse production crawl metadata.
test('preview site excludes production URLs and resets stale crawl metadata', async () => {
  await withSite({ siteUrl: 'https://music.example.com/' }, async (directory) => {
    await buildSite({ outputDirectory: directory });
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    assert.match(html, /name="robots" content="noindex,follow"/);
    assert.doesNotMatch(html, /rel="canonical"|property="og:url"|music.example.com/);
    assert.doesNotMatch(await readFile(join(directory, 'sitemap.xml'), 'utf8'), /<loc>/);
    assert.equal(await readFile(join(directory, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
  });
});

// Verify that malformed deployment addresses cannot create unsafe metadata or broken subpaths.
test('normalizes custom domains and rejects unsafe site URLs', () => {
  assert.equal(normalizeSiteUrl('https://music.example.com'), 'https://music.example.com/');
  assert.equal(normalizeSiteUrl('https://example.com/project///'), 'https://example.com/project/');
  for (const value of ['javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/?x=1', 'https://example.com/#fragment']) {
    assert.throws(() => normalizeSiteUrl(value));
  }
});
