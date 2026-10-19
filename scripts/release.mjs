import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareArtifact } from './release/artifact.mjs';
import { parseReleaseOptions, releaseHelp } from './release/options.mjs';
import { runCommand } from './release/process.mjs';

/** Locate the development checkout independently of the invoking shell's current directory. */
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

/** Require a clean working tree before publishing or creating a release commit. */
async function requireCleanTree(root, run) {
  const changes = await run('git', ['status', '--porcelain'], { cwd: root, capture: true });
  if (changes) throw new Error('Commit or stash working tree changes before a real release; --dry-run also works with uncommitted changes.');
}

/** Check Git identity and the target branch before a registry mutation can succeed. */
async function releaseBranch(root, push, run) {
  const branch = await run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root, capture: true });
  for (const identity of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) await run('git', ['var', identity], { cwd: root, capture: true });
  if (push) await run('git', ['remote', 'get-url', 'origin'], { cwd: root, capture: true });
  return branch;
}

/** Detect new source commits or working-tree edits before publishing or recording the prepared artifact. */
async function requireOriginalSource(root, commit, run) {
  await requireCleanTree(root, run);
  const current = await run('git', ['rev-parse', 'HEAD'], { cwd: root, capture: true });
  if (current !== commit) throw new Error('Git HEAD changed during release preparation; refusing to use a different source commit.');
}

/** Persist a successfully published version and synchronize its commit and annotated tag. */
async function recordRelease(root, artifact, branch, push, run) {
  if (await readFile(join(root, 'package.json'), 'utf8') !== artifact.original) throw new Error('package.json changed after publication; preserve the edits and finish release recording manually.');
  await writeFile(join(root, 'package.json'), artifact.updated);
  await run('git', ['add', '--', 'package.json'], { cwd: root });
  await run('git', ['commit', '-m', `chore: release v${artifact.version}`, '--only', '--', 'package.json'], { cwd: root });
  await run('git', ['tag', '-a', `v${artifact.version}`, '-m', `Release v${artifact.version}`], { cwd: root });
  if (push) await run('git', ['push', '--atomic', 'origin', `HEAD:refs/heads/${branch}`, `refs/tags/v${artifact.version}`], { cwd: root });
}

/** Validate, stage, and publish one incremented npm version before recording its Git release. */
export async function release(args, { root = projectRoot, run = runCommand, log = console.log } = {}) {
  const options = parseReleaseOptions(args);
  if (options.help) { log(releaseHelp); return; }
  let branch;
  let sourceCommit;
  if (!options.dryRun) {
    await requireCleanTree(root, run);
    sourceCommit = await run('git', ['rev-parse', 'HEAD'], { cwd: root, capture: true });
    branch = await releaseBranch(root, options.push, run);
    await run('npm', ['whoami'], { cwd: root });
  }
  await run('npm', ['run', 'check'], { cwd: root });
  await run('npm', ['test'], { cwd: root });
  const temporary = await mkdtemp(join(tmpdir(), 'lyria-release-'));
  let artifact;
  let published = false;
  try {
    artifact = await prepareArtifact(root, temporary, options, run);
    const tag = options.tag ?? (artifact.version.includes('-') ? 'next' : 'latest');
    log(`${options.dryRun ? 'Preview' : 'Release'}: ${artifact.name}@${artifact.version} (npm tag: ${tag})`);
    if (!options.dryRun) {
      await requireOriginalSource(root, sourceCommit, run);
      if (await readFile(join(root, 'package.json'), 'utf8') !== artifact.original) throw new Error('package.json changed during release preparation.');
      const existing = await run('git', ['tag', '--list', `v${artifact.version}`], { cwd: root, capture: true });
      if (existing) throw new Error(`Git tag v${artifact.version} already exists.`);
    }
    const publishArgs = ['publish', artifact.tarball, '--access', 'public', '--tag', tag, '--ignore-scripts'];
    if (options.dryRun) publishArgs.push('--dry-run');
    await run('npm', publishArgs, { cwd: root });
    if (options.dryRun) { log('Dry run complete; version, Git history, and npm registry are unchanged.'); return; }
    published = true;
    await requireOriginalSource(root, sourceCommit, run);
    await recordRelease(root, artifact, branch, options.push, run);
    log(`Published ${artifact.name}@${artifact.version}${options.push ? ' and pushed the release commit and tag.' : '; release commit and tag remain local.'}`);
  } catch (error) {
    if (published) log(`npm already published ${artifact.name}@${artifact.version}. Finish the local version/commit/tag and Git push manually; do not run another release to recover.`);
    else if (artifact) log(`Release stopped before confirmed publication. Check npm for ${artifact.name}@${artifact.version} before retrying if the publish response was interrupted.`);
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

// Run the release command only when invoked directly rather than imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await release(process.argv.slice(2)); }
  catch (error) { console.error(`Release failed: ${error.message}`); process.exitCode = 1; }
}
