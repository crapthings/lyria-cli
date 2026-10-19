import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { extractMusic } from '../dist/generate.js';
import { saveAudio } from '../dist/output.js';
import { wantsJson } from '../dist/options.js';
/** Build a minimal service response for audio validation tests. */
function response(parts) {
    return { candidates: [{ content: { parts } }] };
}
// Verify that model refusals and corrupt or ambiguous audio never produce successful output.
test('rejects blocked, truncated, malformed, unsupported, and multiple audio responses', () => {
    const audio = { inlineData: { mimeType: 'audio/mpeg', data: 'YWJj' } };
    for (const [value, code] of [
        [{ promptFeedback: { blockReason: 'SAFETY' } }, 'CONTENT_BLOCKED'],
        [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }, 'GENERATION_REJECTED'],
        [response([]), 'NO_AUDIO'],
        [response([{ inlineData: { mimeType: 'audio/wav', data: 'YWJj' } }]), 'UNSUPPORTED_AUDIO'],
        [response([{ inlineData: { mimeType: 'audio/mpeg', data: '???' } }]), 'INVALID_AUDIO'],
        [response([audio, audio]), 'MULTIPLE_AUDIO'],
    ])
        assert.throws(() => extractMusic(value), error => error.code === code);
});
// Verify that a file created after preflight is never overwritten by a competing save.
test('publishes a complete file atomically and protects against competing writers', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'lyria-race-'));
    try {
        const path = join(cwd, 'song.mp3');
        const results = await Promise.allSettled([
            saveAudio(path, Buffer.from('first'), false), saveAudio(path, Buffer.from('second'), false),
        ]);
        assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        assert.ok(['first', 'second'].includes(await readFile(path, 'utf8')));
        assert.deepEqual(await readdir(cwd), ['song.mp3']);
    }
    finally {
        await rm(cwd, { recursive: true, force: true });
    }
});
// Verify that option-like prompt values cannot silently switch output formats.
test('JSON detection respects option values and argument terminators', () => {
    assert.equal(wantsJson(['generate', '--prompt=--json']), false);
    assert.equal(wantsJson(['generate', '--', '--json']), false);
    assert.equal(wantsJson(['generate', '--prompt', 'song', '--json']), true);
});
