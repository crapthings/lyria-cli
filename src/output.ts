import { link, lstat, open, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CliError } from './errors.js';
/** Check output conflicts and directory access before requesting music. */
export async function prepareOutput(output: string, overwrite: boolean): Promise<string> {
    const path = resolve(output);
    try {
        const info = await lstat(path);
        if (!overwrite || !info.isFile())
            throw new CliError('OUTPUT_EXISTS', 'Output exists; use a new path or --overwrite for a regular file.');
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
            throw error;
    }
    const probe = join(dirname(path), `.lyria-${randomUUID()}.tmp`);
    const handle = await open(probe, 'wx', 0o600);
    await handle.close();
    await unlink(probe);
    return path;
}
/** Save complete audio without exposing partial files or overwriting files unless requested. */
export async function saveAudio(path: string, audio: Buffer, overwrite: boolean): Promise<void> {
    const temporary = join(dirname(path), `.lyria-${randomUUID()}.tmp`);
    try {
        const handle = await open(temporary, 'wx');
        try {
            await handle.writeFile(audio);
        }
        finally {
            await handle.close();
        }
        if (overwrite)
            await rename(temporary, path);
        else
            await link(temporary, path);
    }
    finally {
        await unlink(temporary).catch(() => { });
    }
}
