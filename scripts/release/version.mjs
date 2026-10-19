import semver from 'semver';

/** Recognize only npm's explicit package-not-found response as an unpublished package. */
function isUnpublished(error) {
  try { return JSON.parse(error.stdout).error?.code === 'E404'; }
  catch { return false; }
}

/** Read the registry's published versions without guessing after network or authentication failures. */
export async function readPublishedVersions(root, name, run) {
  let output;
  try {
    output = await run('npm', ['view', name, 'versions', '--json', '--prefer-online', '--fetch-retries=0'], { cwd: root, capture: true });
  } catch (error) {
    if (isUnpublished(error)) return [];
    throw new Error(`Cannot read published versions for ${name}; refusing to guess a release version. ${error.message}`);
  }
  const result = JSON.parse(output);
  const versions = typeof result === 'string' ? [result] : result;
  if (!Array.isArray(versions) || versions.some(version => typeof version !== 'string' || !semver.valid(version))) {
    throw new Error(`Registry returned invalid versions for ${name}.`);
  }
  return versions.map(version => semver.valid(version));
}

/** Increment from the highest relevant local or registry version while keeping prerelease channels separate. */
export function nextReleaseVersion(localVersion, published, options) {
  if (!semver.valid(localVersion)) throw new Error(`Invalid local package version: ${localVersion}`);
  const eligible = published.filter(version => {
    const channel = semver.prerelease(version);
    return !channel || (options.increment === 'prerelease' && channel[0] === options.preid);
  });
  const base = semver.rsort([localVersion, ...eligible])[0];
  const next = semver.inc(base, options.increment, options.preid);
  if (!next || published.includes(next)) throw new Error('Cannot compute an unused release version.');
  return next;
}
