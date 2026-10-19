import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';

/** Copy the npm allowlist into an isolated staging directory without local credentials or build tools. */
async function copyPackageFiles(root, stage, pkg) {
  const paths = new Set([...pkg.files, 'README.md', 'LICENSE']);
  for (const path of paths) {
    const source = resolve(root, path);
    const relativePath = relative(root, source);
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error(`Invalid release file path: ${path}`);
    await cp(source, join(stage, path), { recursive: true });
  }
}

/** Prepare the incremented package with npm's own semver rules and pack exactly the staged contents. */
export async function prepareArtifact(root, temporary, options, run) {
  const original = await readFile(join(root, 'package.json'), 'utf8');
  const pkg = JSON.parse(original);
  const stage = join(temporary, 'package');
  await mkdir(stage);
  await copyPackageFiles(root, stage, pkg);
  await writeFile(join(stage, 'package.json'), original);
  const versionArgs = ['version', options.increment, '--no-git-tag-version', '--ignore-scripts', '--package-lock=false'];
  if (options.increment === 'prerelease') versionArgs.push('--preid', options.preid);
  await run('npm', versionArgs, { cwd: stage, capture: true });
  const updated = await readFile(join(stage, 'package.json'), 'utf8');
  const { version } = JSON.parse(updated);
  const artifacts = JSON.parse(await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], { cwd: stage, capture: true }));
  const artifact = artifacts[0];
  if (artifacts.length !== 1 || artifact.name !== pkg.name || artifact.version !== version) throw new Error('Packed artifact does not match the planned release.');
  for (const required of ['dist/cli.js', 'skills/lyria-music/SKILL.md', 'skills/lyria-music/references/prompting.md']) {
    if (!artifact.files.some(file => file.path === required)) throw new Error(`Release artifact is missing ${required}.`);
  }
  return { name: pkg.name, version, original, updated, tarball: join(temporary, artifact.filename) };
}
