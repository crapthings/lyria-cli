import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
/** Locate the built executable independently of the test process working directory. */
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
/** Locate the network stub used exclusively by child processes in this test suite. */
const fixture = fileURLToPath(new URL('./fake-api.mjs', import.meta.url));
/** Run the real executable with isolated environment, piped input, and optional cancellation. */
function run(args, { cwd, input = '', mode = 'success', key = 'fake-secret', cancel = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', fixture, cli, ...args], {
            cwd, env: { ...process.env, GEMINI_API_KEY: key, LYRIA_TEST_MODE: mode },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => {
            stderr += chunk;
            if (cancel && stderr.includes('Generating'))
                setTimeout(() => child.kill('SIGINT'), 100);
        });
        child.on('error', reject);
        child.on('close', code => resolve({ code, stdout, stderr }));
        child.stdin.on('error', () => { });
        child.stdin.end(input);
    });
}
/** Give each filesystem test a private directory that is always removed afterward. */
async function withDirectory(callback) {
    const directory = await mkdtemp(join(tmpdir(), 'lyria-test-'));
    try {
        await callback(directory);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}
// Verify that the shipped command can explain itself without credentials.
test('help and version work without credentials', async () => {
    const help = await run(['--help'], { key: '' });
    assert.equal(help.code, 0);
    assert.match(help.stdout, /Usage: lyria-cli/);
    const version = await run(['--version'], { key: '' });
    assert.equal(version.stdout.trim(), JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version);
});
// Verify the complete SDK request, binary file write, text extraction, and JSON contract.
test('generates from stdin and reports saved audio and all descriptive text', async () => {
    await withDirectory(async (cwd) => {
        const result = await run(['generate', '--json'], { cwd, input: 'Calm piano music' });
        assert.equal(result.code, 0, result.stderr + result.stdout);
        const data = JSON.parse(result.stdout);
        assert.equal(data.ok, true);
        assert.equal(data.files[0].path, join(await realpath(cwd), 'music.mp3'));
        assert.equal(data.files[0].bytes, 8);
        assert.equal(data.files[0].mimeType, 'audio/mpeg');
        assert.equal(data.text, 'A calm instrumental.\nVerse and chorus.');
        assert.equal(await readFile(data.files[0].path, 'utf8'), 'fake-mp3');
        assert.deepEqual(await readdir(cwd), ['music.mp3']);
    });
});
// Verify that existing files are protected before any API request and replaced only explicitly.
test('refuses overwrite and supports explicit replacement', async () => {
    await withDirectory(async (cwd) => {
        await writeFile(join(cwd, 'music.mp3'), 'original');
        const blocked = await run(['generate', '--prompt', 'Piano', '--json'], { cwd, mode: 'rate-limit' });
        assert.equal(JSON.parse(blocked.stdout).error.code, 'OUTPUT_EXISTS');
        assert.equal(await readFile(join(cwd, 'music.mp3'), 'utf8'), 'original');
        const replaced = await run(['generate', '--prompt', 'Piano', '--overwrite', '--json'], { cwd });
        assert.equal(replaced.code, 0, replaced.stdout);
        assert.equal(await readFile(join(cwd, 'music.mp3'), 'utf8'), 'fake-mp3');
        assert.deepEqual(await readdir(cwd), ['music.mp3']);
    });
});
// Verify that file prompts preserve Unicode and option-looking prompt content remains data.
test('reads prompt files and treats --help as prompt content', async () => {
    await withDirectory(async (cwd) => {
        await writeFile(join(cwd, 'prompt.txt'), '温柔的钢琴曲');
        const file = await run(['generate', '--prompt-file', 'prompt.txt', '--json'], { cwd });
        assert.equal(file.code, 0, file.stdout);
        const literal = await run(['generate', '--prompt=--help', '--overwrite', '--json'], { cwd });
        assert.equal(literal.code, 0, literal.stdout);
        assert.equal(JSON.parse(literal.stdout).ok, true);
    });
});
// Verify that common input mistakes produce structured failures and usage exit codes.
test('rejects invalid arguments, empty input, and missing credentials', async () => {
    for (const args of [
        ['--prompt', 'a', '--prompt-file', 'b'], ['--timeout', 'NaN'], ['--timeout', '0'],
        ['--output', 'music.wav'], ['--unknown'], ['--prompt', ''], [],
    ]) {
        const result = await run(['generate', '--json', ...args]);
        assert.equal(result.code, 2, result.stdout);
        assert.equal(JSON.parse(result.stdout).error.code, 'INVALID_ARGUMENT');
    }
    const missing = await run(['generate', '--prompt', 'Piano', '--json'], { key: '' });
    assert.equal(JSON.parse(missing.stdout).error.code, 'MISSING_API_KEY');
});
// Verify that service failures are safe, machine-readable, and leave no output artifacts.
test('handles quota failures, missing audio, timeout, and cancellation', async () => {
    await withDirectory(async (cwd) => {
        for (const [mode, expected, extra, cancel] of [
            ['rate-limit', 'RATE_LIMITED', [], false], ['no-audio', 'NO_AUDIO', [], false],
            ['slow', 'TIMEOUT', ['--timeout', '0.2'], false], ['slow', 'CANCELLED', [], true],
        ]) {
            const result = await run(['generate', '--prompt', 'Piano', '--json', ...extra], { cwd, mode, cancel });
            assert.equal(JSON.parse(result.stdout).error.code, expected, result.stderr + result.stdout);
            assert.notEqual(result.code, 0);
            if (cancel)
                assert.equal(result.code, 130);
            assert.doesNotMatch(result.stdout, /private request data|fake-secret/);
            assert.deepEqual(await readdir(cwd), []);
        }
    });
});
