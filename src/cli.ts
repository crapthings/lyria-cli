#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { CliError, normalizeError } from './errors.js';
import { generateMusic } from './generate.js';
import { help, parseCommand, readPrompt, wantsJson } from './options.js';
import { prepareOutput, saveAudio } from './output.js';
/** Execute a single command and emit a stable result only after its audio file is saved. */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const json = wantsJson(args);
    const controller = new AbortController();
    const cancel = () => controller.abort(new CliError('CANCELLED', 'Generation cancelled.', 130));
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const command = parseCommand(args);
        if (command.kind === 'help') {
            process.stdout.write(help);
            return;
        }
        if (command.kind === 'version') {
            const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
                version: string;
            };
            process.stdout.write(`${pkg.version}\n`);
            return;
        }
        if (command.kind !== 'generate')
            return;
        const { options } = command;
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey)
            throw new CliError('MISSING_API_KEY', 'Set GEMINI_API_KEY before generating music.', 2);
        const prompt = await readPrompt(options, controller.signal);
        controller.signal.throwIfAborted();
        const path = await prepareOutput(options.output, options.overwrite);
        timer = setTimeout(() => controller.abort(new CliError('TIMEOUT', 'Generation exceeded --timeout; no automatic retry was made.')), options.timeout * 1000);
        process.stderr.write(`Generating music with ${options.model}...\n`);
        const music = await generateMusic(apiKey, options.model, prompt, controller.signal);
        controller.signal.throwIfAborted();
        clearTimeout(timer);
        await saveAudio(path, music.audio, options.overwrite);
        const result = { ok: true, model: options.model, files: [{ path, mimeType: music.mimeType, bytes: music.audio.length }], text: music.text };
        process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `Saved ${path} (${music.audio.length} bytes)\n${music.text ? `${music.text}\n` : ''}`);
    }
    catch (error) {
        const failure = normalizeError(controller.signal.aborted ? controller.signal.reason : error);
        const result = { ok: false, error: { code: failure.code, message: failure.message } };
        if (json)
            process.stdout.write(`${JSON.stringify(result)}\n`);
        else
            process.stderr.write(`${failure.code}: ${failure.message}\n`);
        process.exitCode = failure.exitCode;
    }
    finally {
        clearTimeout(timer);
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
    }
}
// Start the CLI after defining its command lifecycle.
await main();
