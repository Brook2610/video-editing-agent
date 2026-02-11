# Multi-Speaker TTS

## Overview

Gemini TTS supports generating audio with **two distinct speakers** in a single request. This is useful for dialogue, interviews, podcast snippets, and character conversations in videos.

**Requirements:**
- Model must be `gemini-2.5-flash-preview-tts` (Pro does NOT support multi-speaker).
- Maximum 2 speakers per request.
- Speaker names in the `speakers` parameter must exactly match the names used in the transcript text.

## Using the Tool

### Basic Two-Speaker Call

```python
generate_speech(
    text="""Host: Welcome back to the show! Today we're talking about AI in filmmaking.
Guest: Thanks for having me. It's a fascinating topic.""",
    speakers=[
        {"name": "Host", "voice_name": "Charon"},
        {"name": "Guest", "voice_name": "Sulafat"}
    ]
)
```

### With Style Prompt

```python
generate_speech(
    text="""Alex: So what exactly happened at the launch event?
Jordan: It was incredible. The moment the lights came up, everyone just gasped.""",
    speakers=[
        {"name": "Alex", "voice_name": "Kore"},
        {"name": "Jordan", "voice_name": "Puck"}
    ],
    style_prompt="Make Alex sound serious and inquisitive, like an investigative journalist. Make Jordan sound excited and animated, reliving the moment."
)
```

## Transcript Format

The model expects a conversational transcript with speaker labels:

```
Speaker1: Their dialogue line.
Speaker2: Their response.
Speaker1: Continuation of conversation.
```

### Rules for the Transcript

1. **Speaker names must match**: The names used as labels in the text (e.g., "Host:", "Guest:") must exactly match the `name` field in the `speakers` list.

2. **Colon-delimited**: Each line starts with `SpeakerName:` followed by the dialogue.

3. **Natural flow**: Write dialogue naturally. The model handles turn-taking, pauses between speakers, and conversational rhythm.

4. **Style per speaker**: You can give individual style guidance in the `style_prompt`:
   ```
   Make Speaker1 sound tired and bored, and Speaker2 sound excited and happy.
   ```

## Voice Pairing Strategies

Pick voices with contrasting characteristics so listeners can distinguish speakers:

| Scenario | Speaker 1 | Speaker 2 | Why It Works |
|----------|-----------|-----------|-------------|
| Podcast interview | Charon (Informative) | Sulafat (Warm) | Professional host + warm guest |
| Debate | Kore (Firm) | Puck (Upbeat) | Serious vs energetic contrast |
| Story dialogue | Gacrux (Mature) | Leda (Youthful) | Age/maturity contrast |
| Casual chat | Zubenelgenubi (Casual) | Callirrhoe (Easy-going) | Both relaxed but different textures |
| News + Field reporter | Schedar (Even) | Fenrir (Excitable) | Studio calm vs field energy |
| Teacher + Student | Sadaltager (Knowledgeable) | Achird (Friendly) | Authority vs warmth |

Avoid pairing two voices with the same tone descriptor (e.g., both "Firm") — they'll sound too similar.

## Per-Speaker Style Control

You can direct each speaker's performance individually in the `style_prompt`:

```
Make Dr. Chen sound measured and authoritative, speaking slowly with careful emphasis on technical terms.
Make Liam sound enthusiastic and fast-paced, like a student who just made a breakthrough discovery.
```

This works better than generic "make it conversational" — the model applies different performance styles to each speaker.

## Chunking Multi-Speaker Audio

For long dialogues in videos:

1. **Split by scene, not by speaker**: Keep both speakers in the same chunk if they're in the same scene. The turn-taking rhythm is part of the performance.

2. **Chunk boundaries**: Break at natural conversation breaks — topic changes, scene transitions, not mid-exchange.

3. **Target chunk size**: 4–8 dialogue turns per chunk works well. More than ~15 turns in one request may degrade quality.

4. **Keep style consistent**: Use the same `style_prompt` and `speakers` configuration across all chunks of the same conversation.

## Limitations

- **2 speakers max**: Each `generate_speech` call supports at most 2 speakers. For 3+ characters, generate separate calls and composite in Remotion.
- **Flash model only**: `gemini-2.5-pro-preview-tts` does NOT support multi-speaker.
- **No mid-conversation voice switch**: You can't change a speaker's voice partway through. Plan your voice assignments before generating.
- **Speaker names are rigid**: "Host" in text must match "Host" in speakers list — not "host" or "HOST" or "The Host". Case and exact spelling matter.

## Workarounds for 3+ Speakers

If the video needs more than 2 characters:
1. Group dialogue into 2-speaker segments.
2. Generate each segment as a separate `generate_speech` call.
3. Measure durations with `get_asset_info`.
4. Place each segment in the Remotion timeline at the correct frame offset.
5. Keep voice assignments consistent across segments (Character A always uses the same voice).

## API Details (How It Works Under the Hood)

The multi-speaker call uses `MultiSpeakerVoiceConfig` with `SpeakerVoiceConfig` entries:

```python
# This is what the tool constructs internally:
speech_config=types.SpeechConfig(
    multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
        speaker_voice_configs=[
            types.SpeakerVoiceConfig(
                speaker='Host',          # Must match text label
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name='Charon',
                    )
                )
            ),
            types.SpeakerVoiceConfig(
                speaker='Guest',         # Must match text label
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name='Sulafat',
                    )
                )
            ),
        ]
    )
)
```

You don't need to write this — the `generate_speech` tool handles it. Just pass the `speakers` list.
