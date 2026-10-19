/** Replace network access with a deterministic Gemini response in subprocess tests. */
globalThis.fetch = async (url, options) => {
    const mode = process.env.LYRIA_TEST_MODE ?? 'success';
    const request = JSON.parse(options.body);
    if (!String(url).includes('/models/lyria-3.5:generateContent') ||
        request.generationConfig.responseModalities.join(',') !== 'AUDIO,TEXT' ||
        !request.contents[0].parts[0].text) {
        throw new Error('Unexpected SDK request');
    }
    if (mode === 'slow') {
        return await new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        });
    }
    if (mode === 'rate-limit')
        return new Response(JSON.stringify({ error: { code: 429, message: 'private request data' } }), { status: 429 });
    const parts = mode === 'no-audio' ? [{ text: 'No song' }] : [
        { text: 'A calm instrumental.' },
        { inlineData: { mimeType: 'audio/mpeg', data: Buffer.from('fake-mp3').toString('base64') } },
        { text: 'Verse and chorus.' },
    ];
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts } }] }), {
        headers: { 'content-type': 'application/json' },
    });
};
