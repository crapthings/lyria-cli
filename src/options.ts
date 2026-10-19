import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { addAbortSignal } from 'node:stream';
import { CliError } from './errors.js';
/** Describe the validated options for a single generation request. */
export interface Options {
    prompt?: string;
    promptFile?: string;
    output: string;
    model: string;
    timeout: number;
    overwrite: boolean;
    json: boolean;
}
/** Describe global informational commands without requiring generation credentials. */
export type Command = {
    kind: 'help' | 'version';
} | {
    kind: 'generate';
    options: Options;
};
/** Define value-bearing flags so error output detection never mistakes prompt text for a flag. */
const valueFlags = new Set(['--prompt', '--prompt-file', '--output', '--model', '--timeout']);
/** Detect JSON mode even when another argument prevents complete parsing. */
export function wantsJson(args: string[]): boolean {
    for (let index = 0; index < args.length; index++) {
        const argument = args[index]!;
        if (argument === '--')
            break;
        if (argument === '--json')
            return true;
        if (valueFlags.has(argument) && !args[index + 1]?.startsWith('--'))
            index++;
    }
    return false;
}
/** Document the complete public command surface for humans and agents. */
export const help = `Usage: lyria-cli generate [options]

Generate music with Google Lyria using GEMINI_API_KEY.

  --prompt <text>       Music description or lyrics
  --prompt-file <path>  Read UTF-8 prompt from a file (- for stdin)
  --output <path>       Audio output path (default: music.mp3)
  --model <id>          Model ID (default: lyria-3.5)
  --timeout <seconds>   Request deadline (default: 300)
  --overwrite          Replace an existing output
  --json               Emit one JSON result on stdout, including errors
  --help, -h           Show help
  --version, -v        Show version

If no prompt option is given, read piped stdin.
Only MP3 output is supported; output paths must end in .mp3.
No automatic retries are made. Progress goes to stderr.
`;
/** Parse command arguments and reject invalid combinations before making a paid request. */
export function parseCommand(args: string[]): Command {
    try {
        const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
                prompt: { type: 'string' }, 'prompt-file': { type: 'string' }, output: { type: 'string' },
                model: { type: 'string' }, timeout: { type: 'string' }, overwrite: { type: 'boolean' }, json: { type: 'boolean' },
                help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
            } });
        if (values.help || !args.length)
            return { kind: 'help' };
        if (values.version)
            return { kind: 'version' };
        if (positionals.length !== 1 || positionals[0] !== 'generate')
            throw new Error('Expected the generate command.');
        if (values.prompt !== undefined && values['prompt-file'] !== undefined)
            throw new Error('Use only one prompt source.');
        const timeout = Number(values.timeout ?? 300);
        if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2147483)
            throw new Error('--timeout must be between 0 and 2147483 seconds.');
        const output = values.output ?? 'music.mp3';
        if (!output.toLowerCase().endsWith('.mp3'))
            throw new Error('--output must end in .mp3.');
        const model = values.model ?? 'lyria-3.5';
        if (!model.trim())
            throw new Error('--model must not be empty.');
        return { kind: 'generate', options: { ...(values.prompt !== undefined ? { prompt: values.prompt } : {}),
                ...(values['prompt-file'] !== undefined ? { promptFile: values['prompt-file'] } : {}),
                output, model, timeout, overwrite: values.overwrite ?? false, json: values.json ?? false } };
    }
    catch (error) {
        throw new CliError('INVALID_ARGUMENT', (error as Error).message, 2);
    }
}
/** Resolve one nonempty UTF-8 prompt from arguments, a file, or piped stdin. */
export async function readPrompt(options: Options, signal: AbortSignal): Promise<string> {
    let prompt = options.prompt;
    if (options.promptFile !== undefined && options.promptFile !== '-')
        prompt = await readFile(options.promptFile, 'utf8');
    if (prompt === undefined) {
        if (process.stdin.isTTY)
            throw new CliError('INVALID_ARGUMENT', 'Provide --prompt, --prompt-file, or piped stdin.', 2);
        addAbortSignal(signal, process.stdin);
        process.stdin.setEncoding('utf8');
        prompt = '';
        for await (const chunk of process.stdin)
            prompt += chunk;
    }
    if (!prompt.trim())
        throw new CliError('INVALID_ARGUMENT', 'Prompt must not be empty.', 2);
    return prompt;
}
