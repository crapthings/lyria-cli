import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Locate website and package sources independently of the caller's current directory. */
const root = fileURLToPath(new URL('../', import.meta.url));

/** Escape generated metadata values for HTML and XML attributes. */
function escapeAttribute(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/** Normalize a public site URL while preserving GitHub project paths and custom domains. */
export function normalizeSiteUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('SITE_URL must be an HTTP(S) URL without credentials, query, or fragment.');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/`;
}

/** Construct crawl and social metadata using the actual deployment address when available. */
function seoMetadata(siteUrl, version) {
  const data = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'lyria-cli',
    description: 'A command-line tool for generating music with Google Lyria, with MP3 output and structured JSON for AI agents.',
    applicationCategory: 'DeveloperApplication', operatingSystem: 'Windows, macOS, Linux',
    softwareRequirements: 'Node.js 22+ and a Gemini API key', softwareVersion: version,
    license: 'https://spdx.org/licenses/MIT.html', ...(siteUrl ? { url: siteUrl } : {}) };
  const tags = siteUrl ? [
    '<meta name="robots" content="index,follow">',
    `<link rel="canonical" href="${escapeAttribute(siteUrl)}">`,
    `<meta property="og:url" content="${escapeAttribute(siteUrl)}">`,
    `<meta property="og:image" content="${escapeAttribute(`${siteUrl}assets/social.png`)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="lyria-cli — Music, from your terminal. Google Lyria for you and your agents.">',
    `<meta name="twitter:image" content="${escapeAttribute(`${siteUrl}assets/social.png`)}">`,
    '<meta name="twitter:image:alt" content="lyria-cli — Music, from your terminal.">',
  ] : ['<meta name="robots" content="noindex,follow">'];
  tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
  return tags.join('\n  ');
}

/** Build the static Pages artifact, bundled skill, and deployment-specific crawler files. */
export async function buildSite({ siteUrl = '', repository = '', outputDirectory = join(root, '_site') } = {}) {
  const publicUrl = normalizeSiteUrl(siteUrl);
  if (repository && !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY must be owner/repo.');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const template = await readFile(join(root, 'website/index.html'), 'utf8');
  const sourceLink = repository ? `<a href="https://github.com/${escapeAttribute(repository)}">GitHub ↗</a>` : '';
  const html = template.replace('<!-- SEO -->', seoMetadata(publicUrl, pkg.version)).replace('<!-- SOURCE_LINK -->', sourceLink);
  await mkdir(outputDirectory, { recursive: true });
  await cp(join(root, 'website'), outputDirectory, { recursive: true });
  await cp(join(root, 'skills'), join(outputDirectory, 'skills'), { recursive: true });
  await writeFile(join(outputDirectory, 'index.html'), html);
  await writeFile(join(outputDirectory, '.nojekyll'), '');
  await writeFile(join(outputDirectory, 'robots.txt'), publicUrl
    ? `User-agent: *\nAllow: /\nSitemap: ${publicUrl}sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n');
  const sitemap = publicUrl ? `<url><loc>${escapeAttribute(publicUrl)}</loc></url>` : '';
  await writeFile(join(outputDirectory, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap}</urlset>\n`);
  return outputDirectory;
}

// Build the site from deployment environment values only when this module is invoked directly.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await buildSite({ siteUrl: process.env.SITE_URL, repository: process.env.GITHUB_REPOSITORY });
  console.log(`Static website built: ${output}`);
}
