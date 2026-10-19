import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { CliError } from './errors.js';
/** Hold the audio and optional descriptive text returned by one model candidate. */
export interface Music {
    audio: Buffer;
    mimeType: string;
    text: string;
}
/** Extract all parts of the selected candidate while rejecting ambiguous or unsupported audio. */
export function extractMusic(response: GenerateContentResponse): Music {
    if (response.promptFeedback?.blockReason)
        throw new CliError('CONTENT_BLOCKED', 'The service blocked this prompt.');
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        throw new CliError('GENERATION_REJECTED', `Generation ended with ${candidate.finishReason}.`);
    }
    const audio: Buffer[] = [];
    const text: string[] = [];
    for (const part of candidate?.content?.parts ?? []) {
        if (part.text && !part.thought)
            text.push(part.text);
        if (!part.inlineData)
            continue;
        const { data, mimeType } = part.inlineData;
        if (mimeType !== 'audio/mpeg' && mimeType !== 'audio/mp3') {
            throw new CliError('UNSUPPORTED_AUDIO', 'The service returned an unsupported audio format.');
        }
        if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) {
            throw new CliError('INVALID_AUDIO', 'The service returned invalid base64 audio.');
        }
        audio.push(Buffer.from(data, 'base64'));
    }
    if (!audio.length)
        throw new CliError('NO_AUDIO', 'The service returned no audio.');
    if (audio.length > 1)
        throw new CliError('MULTIPLE_AUDIO', 'The service returned multiple audio parts; refusing to concatenate separate tracks.');
    return { audio: audio[0]!, mimeType: 'audio/mpeg', text: text.join('\n') };
}
/** Generate one complete song with SDK retries disabled and caller-controlled cancellation. */
export async function generateMusic(apiKey: string, model: string, prompt: string, signal: AbortSignal): Promise<Music> {
    // This pinned SDK performs a single fetch when retryOptions is omitted.
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model, contents: prompt,
        config: { responseModalities: ['AUDIO', 'TEXT'], abortSignal: signal } });
    return extractMusic(response);
}
