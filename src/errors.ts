/** Represent a predictable CLI failure with a stable machine-readable code. */
export class CliError extends Error {
    constructor(public readonly code: string, message: string, public readonly exitCode = 1) {
        super(message);
        this.name = 'CliError';
    }
}
/** Convert SDK and filesystem failures to safe public errors without leaking request contents. */
export function normalizeError(error: unknown): CliError {
    if (error instanceof CliError)
        return error;
    const status = (error as {
        status?: number;
    } | null)?.status;
    if (status === 401 || status === 403)
        return new CliError('AUTH_ERROR', 'API key is invalid or cannot access this model.');
    if (status === 429)
        return new CliError('RATE_LIMITED', 'API quota or rate limit exceeded.');
    if (typeof status === 'number')
        return new CliError('API_ERROR', `Gemini request failed (HTTP ${status}).`);
    const code = (error as NodeJS.ErrnoException | null)?.code;
    if (code === 'EEXIST')
        return new CliError('OUTPUT_EXISTS', 'Output already exists; choose another path or use --overwrite.');
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM' || code === 'ENOSPC' || code === 'EISDIR') {
        return new CliError('FILE_ERROR', `Cannot read or write the requested file (${code}).`);
    }
    return new CliError('GENERATION_FAILED', 'Music generation failed; check network connectivity and model access.');
}
