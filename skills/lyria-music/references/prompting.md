# Music prompt preparation

Adapted from Google's [Lyria prompt guide](https://ai.google.dev/gemini-api/docs/lyria-prompt-guide); checked 2026-10-19. Examples below are original.

Lead with genre, then add the details that matter: mood, instruments and their roles, tempo, key, production texture, and vocals. Concise prompts are valid; avoid contradictory directions.

For instrumental music, explicitly request no vocals. For singing, describe language, vocal timbre, and delivery. Preserve supplied lyrics under `Lyrics:` with section tags such as `[Verse]` and `[Chorus]`; parentheses can indicate backing vocals. If lyrics should be generated, describe their subject and emotional direction instead.

Describe progression with section tags, transitions, or approximate timestamps. Timing, BPM, key, and duration are instructions rather than guarantees.

## Instrumental brief

```text
Chamber folk for a quiet reading scene, about 90 seconds, 76 BPM.
Fingerpicked guitar leads; cello adds warmth. Instrumental, no vocals.
A sparse opening grows gently, then ends softly without a dramatic climax.
```

## Song brief

```text
Mandarin piano ballad, about two minutes, intimate alto vocal.
[Intro] -> [Verse] -> [Chorus] -> [Outro]
Lyrics:
[Verse]
晚风把灯影轻轻吹亮
[Chorus]
我们沿着星光走向远方
```
