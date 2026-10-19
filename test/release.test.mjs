import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { release } from '../scripts/release.mjs';
import { parseReleaseOptions } from '../scripts/release/options.mjs';
import { runCommand } from '../scripts/release/process.mjs';
import { nextReleaseVersion, readPublishedVersions } from '../scripts/release/version.mjs';

/** Create an isolated release fixture with the same required CLI and skill artifact layout. */
async function withPackage(callback) {
  const root = await mkdtemp(join(tmpdir(), 'lyria-release-test-'));
  const pkg = { name: 'lyria-release-fixture', version: '0.1.0', files: ['dist', 'skills', 'docs'] };
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  for (const path of ['dist/cli.js', 'skills/lyria-music/SKILL.md', 'skills/lyria-music/references/prompting.md', 'docs/cli.md', 'README.md', 'LICENSE']) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), 'Release fixture\n');
  }
  try { await callback(root); } finally { await rm(root, { recursive: true, force: true }); }
}

/** Run real offline versioning and packing while simulating every registry and Git mutation. */
function simulatedRelease(root, { failure = '', dirty = false, changedHead = false, published = [], registryError } = {}) {
  const calls = [];
  const messages = [];
  const state = {};
  let headReads = 0;
  const run = async (command, args, options) => {
    calls.push([command, ...args]);
    if (command === 'git' && args[0] === 'status') return dirty ? ' M package.json' : '';
    if (command === 'git' && args[0] === 'symbolic-ref') return 'main';
    if (command === 'git' && args[0] === 'rev-parse') return changedHead && headReads++ ? 'new-source' : 'original-source';
    if (command === 'npm' && args[0] === 'view') {
      if (registryError) throw registryError;
      return JSON.stringify(published);
    }
    if (command === 'npm' && ['version', 'pack'].includes(args[0])) return runCommand(command, args, { ...options, env: { ...process.env, npm_config_cache: join(root, '.npm-cache') } });
    if (command === 'npm' && args[0] === 'publish') {
      state.artifact = JSON.parse(await runCommand('tar', ['-xOf', args[1], 'package/package.json'], { cwd: root, capture: true }));
      state.versionDuringPublish = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
    }
    if (`${command} ${args[0]}` === failure) throw new Error(`Simulated ${failure} failure`);
    return '';
  };
  return { root, run, calls, messages, state, log: message => messages.push(message) };
}

// Verify that dry-run packages the incremented version without modifying the original or invoking Git writes.
test('release dry-run validates and packs the next version without publication or local mutation', async () => {
  await withPackage(async root => {
    const simulation = simulatedRelease(root, { dirty: true });
    const original = await readFile(join(root, 'package.json'), 'utf8');
    await release(['--dry-run'], simulation);
    assert.equal(await readFile(join(root, 'package.json'), 'utf8'), original);
    assert.equal(simulation.state.artifact.version, '0.1.1');
    const publish = simulation.calls.find(call => call[1] === 'publish');
    assert.ok(publish.includes('--dry-run'));
    assert.ok(!simulation.calls.some(call => call[0] === 'git' || call[1] === 'whoami'));
    assert.deepEqual(simulation.calls.slice(0, 2), [['npm', 'run', 'check'], ['npm', 'test']]);
    assert.ok(simulation.messages.some(message => message.includes('unchanged')));
  });
});

// Verify the exact staged tarball is published before the tracked version, release commit, tag, and push change.
test('successful release increments once and records the published version in Git', async () => {
  await withPackage(async root => {
    const simulation = simulatedRelease(root);
    await release([], simulation);
    assert.equal(simulation.state.artifact.version, '0.1.1');
    assert.equal(simulation.state.versionDuringPublish, '0.1.0');
    assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, '0.1.1');
    assert.ok(simulation.calls.some(call => call[0] === 'git' && call[1] === 'tag' && call.includes('v0.1.1')));
    assert.deepEqual(simulation.calls.at(-1), ['git', 'push', '--atomic', 'origin', 'HEAD:refs/heads/main', 'refs/tags/v0.1.1']);
    assert.ok(!simulation.calls.find(call => call[1] === 'publish').includes('--dry-run'));
    assert.equal(simulation.calls.filter(call => call[1] === 'publish').length, 1);
  });
});

// Verify prereleases use npm's semver calculation and default to a separate distribution tag.
test('prerelease candidates default to next and allow an explicit dist-tag', async () => {
  await withPackage(async root => {
    const simulation = simulatedRelease(root);
    await release(['prerelease', '--preid', 'rc', '--dry-run'], simulation);
    assert.equal(simulation.state.artifact.version, '0.1.1-rc.0');
    const publish = simulation.calls.find(call => call[1] === 'publish');
    assert.equal(publish[publish.indexOf('--tag') + 1], 'next');
    const custom = simulatedRelease(root);
    await release(['minor', '--tag', 'preview', '--dry-run'], custom);
    assert.equal(custom.state.artifact.version, '0.2.0');
    const customPublish = custom.calls.find(call => call[1] === 'publish');
    assert.equal(customPublish[customPublish.indexOf('--tag') + 1], 'preview');
  });
});

// Verify dirty trees and failed checks stop before any paid or externally visible mutation.
test('dirty source and failed validation stop before publishing or incrementing', async () => {
  await withPackage(async root => {
    const dirty = simulatedRelease(root, { dirty: true });
    await assert.rejects(release([], dirty), /Commit or stash/);
    assert.equal(dirty.calls.length, 1);
    const failed = simulatedRelease(root, { failure: 'npm test' });
    await assert.rejects(release([], failed), /Simulated npm test/);
    assert.ok(!failed.calls.some(call => call[1] === 'version' || call[1] === 'publish'));
    assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, '0.1.0');
  });
});

// Verify a rejected publication leaves the original version intact and creates no release commit or tag.
test('publish rejection preserves the version and never retries or writes Git history', async () => {
  await withPackage(async root => {
    const simulation = simulatedRelease(root, { failure: 'npm publish' });
    await assert.rejects(release([], simulation), /Simulated npm publish/);
    assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, '0.1.0');
    assert.equal(simulation.calls.filter(call => call[1] === 'publish').length, 1);
    assert.ok(!simulation.calls.some(call => call[0] === 'git' && ['commit', 'add', 'push'].includes(call[1])));
  });
});

// Verify post-publication push failures retain the new version and give recovery guidance without republishing.
test('Git push failure reports that npm publication already succeeded', async () => {
  await withPackage(async root => {
    const simulation = simulatedRelease(root, { failure: 'git push' });
    await assert.rejects(release([], simulation), /Simulated git push/);
    assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, '0.1.1');
    assert.equal(simulation.calls.filter(call => call[1] === 'publish').length, 1);
    assert.ok(simulation.messages.some(message => message.includes('npm already published')));
  });
});

// Verify concurrently committed source changes cannot be stamped with a release prepared from an older commit.
test('source changes detected before publication stop the release', async () => {
  await withPackage(async root => {
    const simulation = simulatedRelease(root, { changedHead: true });
    await assert.rejects(release([], simulation), /Git HEAD changed/);
    assert.ok(!simulation.calls.some(call => call[1] === 'publish'));
  });
});

// Verify release controls reject ambiguous increments and ignored or unsafe distribution arguments.
test('release arguments reject invalid version and prerelease controls', () => {
  for (const args of [['unknown'], ['major', 'minor'], ['--preid', 'beta'], ['prerelease', '--preid', '../beta'], ['--tag', '1.0.0'], ['--unknown']]) {
    assert.throws(() => parseReleaseOptions(args));
  }
  assert.equal(parseReleaseOptions([]).increment, 'patch');
  assert.equal(parseReleaseOptions(['--no-push']).push, false);
});

// Verify the reported stale-local-version failure selects and records the next unused registry version.
test('release skips npm versions already published while the local package is behind', async () => {
  await withPackage(async root => {
    const simulation = simulatedRelease(root, { published: ['0.1.0', '0.1.1'] });
    await release([], simulation);
    assert.equal(simulation.state.artifact.version, '0.1.2');
    assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, '0.1.2');
    assert.equal(simulation.calls.filter(call => call[1] === 'publish').length, 1);
    assert.ok(simulation.calls.some(call => call[0] === 'git' && call[1] === 'tag' && call.includes('v0.1.2')));
  });
});

// Verify version comparisons use numeric semver precedence and isolate unrelated prerelease channels.
test('version planning respects numeric ordering, local advances, and prerelease channels', () => {
  for (const [local, published, increment, preid, expected] of [
    ['0.1.0', ['0.1.9', '0.1.10'], 'patch', 'beta', '0.1.11'],
    ['0.5.0', ['0.1.1'], 'patch', 'beta', '0.5.1'],
    ['0.1.0', ['0.1.1', '2.0.0-beta.0'], 'patch', 'beta', '0.1.2'],
    ['0.1.0', ['0.1.1'], 'minor', 'beta', '0.2.0'],
    ['0.1.0', ['0.1.1'], 'major', 'beta', '1.0.0'],
    ['0.1.0', ['0.1.1', '0.2.0-beta.9', '0.2.0-beta.10', '3.0.0-rc.1'], 'prerelease', 'beta', '0.2.0-beta.11'],
    ['0.2.0-beta.2', ['0.1.1'], 'patch', 'beta', '0.2.0'],
  ]) assert.equal(nextReleaseVersion(local, published, { increment, preid }), expected);
});

// Verify only explicit package absence permits first publication and registry failures stop preparation.
test('registry errors cannot silently fall back to a potentially published version', async () => {
  const missing = Object.assign(new Error('Not found'), { stdout: JSON.stringify({ error: { code: 'E404' } }) });
  assert.deepEqual(await readPublishedVersions('.', 'fixture', async () => { throw missing; }), []);
  assert.deepEqual(await readPublishedVersions('.', 'fixture', async () => JSON.stringify('0.1.1')), ['0.1.1']);
  for (const error of [new Error('Network failure'), Object.assign(new Error('Unauthorized'), { stdout: JSON.stringify({ error: { code: 'E401' } }) })]) {
    await withPackage(async root => {
      const simulation = simulatedRelease(root, { registryError: error });
      await assert.rejects(release(['--dry-run'], simulation), /refusing to guess/);
      assert.ok(!simulation.calls.some(call => call[1] === 'version' || call[1] === 'publish'));
      assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, '0.1.0');
    });
  }
});
