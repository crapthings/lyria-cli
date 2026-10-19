import { parseArgs } from 'node:util';

/** Explain release versioning, preview behavior, and Git synchronization. */
export const releaseHelp = `Usage: npm run release -- [patch|minor|major|prerelease] [options]

Default: bump patch beyond local/npm versions, validate, publish, commit, tag, and push.

  --dry-run       Validate and simulate publishing without changing tracked files or Git
  --preid <id>    Prerelease identifier (default: beta; only with prerelease)
  --tag <name>    npm dist-tag (default: latest for stable, next for prereleases)
  --no-push       Publish and create the local release commit/tag without pushing
  --help, -h      Show help

Examples:
  npm run release -- --dry-run
  npm run release
  npm run release -- minor
  npm run release -- prerelease --preid beta --tag next
`;

/** Validate the release increment and optional npm distribution settings. */
export function parseReleaseOptions(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'dry-run': { type: 'boolean' }, 'no-push': { type: 'boolean' },
    preid: { type: 'string' }, tag: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) return { help: true };
  const increment = positionals[0] ?? 'patch';
  if (positionals.length > 1 || !['patch', 'minor', 'major', 'prerelease'].includes(increment)) {
    throw new Error('Choose patch, minor, major, or prerelease.');
  }
  if (values.preid !== undefined && increment !== 'prerelease') throw new Error('--preid requires prerelease.');
  const preid = values.preid ?? 'beta';
  if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(preid)) throw new Error('--preid must be an identifier such as beta or rc.');
  if (values.tag !== undefined && !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(values.tag)) throw new Error('--tag must be a name such as latest or next.');
  return { help: false, increment, preid, tag: values.tag, dryRun: values['dry-run'] ?? false, push: !values['no-push'] };
}
