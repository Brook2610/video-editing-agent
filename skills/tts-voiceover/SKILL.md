---
name: tts-voiceover
description: Generate and align AI voiceover tracks for video edits using Gemini TTS. Covers single-speaker narration, multi-speaker dialogue, voice selection, style prompting, and timeline integration.
metadata:
  tags: tts, voiceover, narration, audio, timing, remotion, speech, multi-speaker
---

## Quick Start — Simple TTS

For basic voiceover, call `generate_speech` with just the text:

```python
generate_speech(text="Welcome to our product tour.")
```

Defaults: voice `Kore`, model `gemini-2.5-flash-preview-tts`, output saved to `public/assets/tts/tts-<timestamp>.wav`.

### Choosing a Voice

Pick a voice that fits the tone. Here are the top picks by use case:

| Use Case              | Recommended Voices                      |
|-----------------------|-----------------------------------------|
| Neutral narration     | Kore (Firm), Charon (Informative), Schedar (Even), Sadaltager (Knowledgeable) |
| Energetic / upbeat    | Puck (Upbeat), Fenrir (Excitable), Laomedeia (Upbeat) |
| Warm storytelling     | Sulafat (Warm), Achird (Friendly), Vindemiatrix (Gentle) |
| Serious / authoritative | Kore (Firm), Orus (Firm), Alnilam (Firm), Gacrux (Mature) |
| Soft / calm           | Achernar (Soft), Enceladus (Breathy) |
| Casual / conversational | Zubenelgenubi (Casual), Callirrhoe (Easy-going), Umbriel (Easy-going) |

Full 30-voice list → `references/voices.md`

### Adding Style

Use `style_prompt` for delivery control:

```python
generate_speech(
    text="This is the moment everything changed.",
    voice_name="Sulafat",
    style_prompt="Speak slowly and dramatically, like a documentary narrator building suspense."
)
```

Style prompts control tone, pacing, accent, and emotion. Keep them short and clear for simple tasks.

### Multi-Speaker Dialogue

For two-speaker conversations, use `generate_speech` with `speakers`:

```python
generate_speech(
    text="""Alex: Hey, did you see the new release?
Sam: Yeah, it looks incredible!""",
    speakers=[
        {"name": "Alex", "voice_name": "Kore"},
        {"name": "Sam", "voice_name": "Puck"}
    ]
)
```

- Max 2 speakers per request.
- Speaker names in the `speakers` list must exactly match the names used in the text.
- Multi-speaker only works with `gemini-2.5-flash-preview-tts`.

Full multi-speaker details → `references/multi-speaker.md`

## Core Workflow

1. **Plan** narration in scene-based chunks (1–4 sentences each).
2. **Generate** with `generate_speech(...)` → saves WAV to `public/assets/tts/`.
3. **Measure** each chunk with `get_asset_info(...)` to get exact duration.
4. **Adjust** — if duration doesn't match target, rewrite text shorter/longer and regenerate.
5. **Place** in Remotion with `<Sequence>` + `<Audio>` components.
6. **Validate** with `inspect_asset(...)` — check pronunciation, pacing, emotional fit.
7. **Iterate** chunk-by-chunk until QA passes.

## Tool Reference

```
generate_speech(
    text: str,                    # Required. The narration text.
    output_path: str = None,      # Optional. e.g. "public/assets/tts/intro.wav"
    voice_name: str = "Kore",     # Optional. Any of the 30 prebuilt voices.
    style_prompt: str = "",       # Optional. Natural-language delivery instructions.
    model: str = "gemini-2.5-flash-preview-tts",  # Optional. Or "gemini-2.5-pro-preview-tts".
    speakers: list = None         # Optional. For multi-speaker. List of {name, voice_name}.
)
```

Returns: `{ success, path, duration_seconds, sample_rate_hz, channels, size_bytes, ... }`

Output is always 24kHz mono WAV (PCM 16-bit).

## Models

| Model                              | Single | Multi | Notes |
|------------------------------------|:------:|:-----:|-------|
| `gemini-2.5-flash-preview-tts`     | ✓ | ✓ | Default. Fast. Use for most tasks. |
| `gemini-2.5-pro-preview-tts`       | ✓ | ✗ | Higher quality single-speaker only. |

- Text-only input, audio-only output.
- 32k token context window.

## Prompting Quick Guide

For simple tasks, a one-line `style_prompt` is enough:
- `"Read in a calm, professional tone."`
- `"Excited sports announcer style."`
- `"Whisper softly, like telling a secret."`

For complex performances, structure the prompt with these elements:
1. **Audio Profile** — Who is speaking (name, role, character).
2. **Scene** — Environment, mood, what's happening around them.
3. **Director's Notes** — Style, pacing, accent, breathing.
4. **Transcript** — The actual text to speak.

Full prompting guide with examples → `references/prompting-style-and-flow.md`

## When to Read References

| Situation | Reference to Read |
|-----------|-------------------|
| Selecting a voice or hearing all options | `references/voices.md` |
| Multi-speaker dialogue setup | `references/multi-speaker.md` |
| Complex style / accent / pacing control | `references/prompting-style-and-flow.md` |
| Non-English narration or language questions | `references/languages.md` |
| Model selection or API constraints | `references/models-and-limits.md` |
| Chunking, duration fitting, Remotion placement | `references/timeline-integration.md` |
| Simple one-line TTS | **No references needed** — use the info above |

## References

- [references/models-and-limits.md](references/models-and-limits.md)
- [references/voices.md](references/voices.md)
- [references/languages.md](references/languages.md)
- [references/prompting-style-and-flow.md](references/prompting-style-and-flow.md)
- [references/multi-speaker.md](references/multi-speaker.md)
- [references/timeline-integration.md](references/timeline-integration.md)
