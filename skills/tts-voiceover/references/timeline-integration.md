# Timeline Integration

## Purpose

Convert generated TTS speech into frame-accurate narration tracks for Remotion video projects. This reference covers chunking strategy, duration fitting, Remotion placement, and the QA loop.

## Chunking Strategy

### Why Chunk?
- Long narration as one file is hard to time-align with video scenes.
- Per-scene or per-segment chunks allow independent timing adjustments.
- If one chunk sounds wrong, you regenerate only that chunk, not the entire narration.

### Chunk Sizing
| Sync Requirement | Chunk Size | Use When |
|-----------------|------------|----------|
| Strict sync (must match exact video moments) | 1–2 sentences | Timed narration over specific video scenes |
| Moderate sync | 2–4 sentences | General voiceover with loose timing |
| Relaxed sync | 4+ sentences | Intro/outro narration, podcast-style |

### File Naming Convention
Use predictable, sequential file names:
```
public/assets/tts/scene-01-line-01.wav
public/assets/tts/scene-01-line-02.wav
public/assets/tts/scene-02-line-01.wav
```

Or by purpose:
```
public/assets/tts/intro.wav
public/assets/tts/chapter-1.wav
public/assets/tts/outro.wav
```

## Duration Fitting Workflow

Getting TTS duration to match target video duration:

### Step 1: Generate
```python
generate_speech(
    text="Our journey begins in the heart of the Amazon rainforest.",
    output_path="public/assets/tts/scene-01.wav",
    voice_name="Sulafat",
    style_prompt="Slow, cinematic documentary narrator."
)
```

### Step 2: Measure
```python
get_asset_info(asset_path="public/assets/tts/scene-01.wav")
# Returns: { duration_seconds: 4.2, ... }
```

### Step 3: Compare to Target
If the scene runs from 00:03 to 00:08 (5 seconds), and audio is 4.2s:
- **0.8s short** → options below.

### Step 4: Adjust

**If too short (audio shorter than scene):**
- Extend the script text slightly (add a word or two).
- Or add intentional pauses: "Our journey begins... in the heart of the Amazon rainforest."
- Or adjust pacing in `style_prompt`: "Speak more slowly."
- Regenerate.

**If too long (audio longer than scene):**
- Trim the script text (remove words or simplify).
- Or speed up pacing: "Speak at a brisk, efficient pace."
- Regenerate.

**If close (within ~10% / 0.5s):**
- Apply light ffmpeg speed correction:
  ```bash
  ffmpeg -i scene-01.wav -filter:a "atempo=1.05" scene-01-adjusted.wav
  ```
- Stay within 0.9x to 1.1x tempo range. Beyond that, quality degrades.

### Step 5: Add Fades
To prevent click artifacts at chunk boundaries:
```bash
ffmpeg -i scene-01.wav -af "afade=t=in:st=0:d=0.05,afade=t=out:st=<end-0.05>:d=0.05" scene-01-faded.wav
```

Short fades (50ms) are usually sufficient.

## Remotion Placement

### Basic Placement Pattern
```tsx
import { Sequence, Audio, staticFile } from 'remotion';

// Place voiceover at exact frame position
<Sequence from={startFrame} durationInFrames={durationFrames}>
  <Audio src={staticFile("assets/tts/scene-01.wav")} />
</Sequence>
```

### Computing Frames from Timestamps
```tsx
const fps = 30;

// Scene starts at 00:05, ends at 00:10
const startFrame = 5 * fps;  // 150
const durationFrames = 5 * fps; // 150

// Or from MM:SS string:
// "01:23" → (1 * 60 + 23) * fps = 83 * 30 = 2490
```

### Layering Voiceover with Music
Keep voiceover on a dedicated layer and duck background music:

```tsx
// Background music (ducked under voiceover)
<Audio
  src={staticFile("assets/music/bg.mp3")}
  volume={(f) => {
    // Duck to 20% during voiceover sections
    if (f >= voiceoverStart && f <= voiceoverEnd) return 0.2;
    return 0.8;
  }}
/>

// Voiceover layer
<Sequence from={voiceoverStart} durationInFrames={voiceoverDuration}>
  <Audio src={staticFile("assets/tts/narration.wav")} />
</Sequence>
```

### Multiple Chunks in Sequence
```tsx
const chunks = [
  { file: "scene-01-line-01.wav", startSec: 2, durationSec: 3.5 },
  { file: "scene-01-line-02.wav", startSec: 6, durationSec: 4.2 },
  { file: "scene-02-line-01.wav", startSec: 12, durationSec: 5.1 },
];

{chunks.map((chunk) => (
  <Sequence
    key={chunk.file}
    from={Math.round(chunk.startSec * fps)}
    durationInFrames={Math.round(chunk.durationSec * fps)}
  >
    <Audio src={staticFile(`assets/tts/${chunk.file}`)} />
  </Sequence>
))}
```

## QA Loop

### After Generating Each Chunk
1. **Check duration**: `get_asset_info(asset_path="public/assets/tts/scene-01.wav")` — does it fit the target?
2. **Check quality**: `inspect_asset(asset_path="public/assets/tts/scene-01.wav", prompt="Listen for pronunciation errors, unnatural pauses, or pacing issues.")` — does it sound right?
3. **If issues found**: Adjust text or style_prompt and regenerate only the failing chunk.

### After Placing in Timeline
1. **Render the video**: `npx remotion render src/index.ts <CompId> out/video.mp4`
2. **Inspect the output**: `inspect_asset(asset_path="out/video.mp4", prompt="Check if voiceover timing matches the visuals. Note any sync issues or audio quality problems.")` 
3. **If sync issues**: Adjust frame positions or regenerate chunks.

### Common QA Issues and Fixes
| Issue | Fix |
|-------|-----|
| Audio too fast for scene | Rewrite text shorter, or slow pacing in style_prompt |
| Audio too slow for scene | Rewrite text longer, or speed up pacing |
| Pronunciation error | Add pronunciation hint in style_prompt, or use phonetic spelling |
| Unnatural pause | Adjust punctuation in text (remove/add commas, periods) |
| Click at chunk boundary | Add 50ms fade in/out with ffmpeg |
| Volume mismatch between chunks | Normalize with ffmpeg: `ffmpeg -i in.wav -af loudnorm out.wav` |
| Voiceover buried under music | Increase music ducking (lower music volume during voiceover) |

## Recommended Execution Sequence

1. Draft the narration script, split into chunks, note target durations.
2. Generate all chunks with `generate_speech(...)`.
3. Measure all durations with `get_asset_info(...)`.
4. Adjust and regenerate any chunks that don't fit.
5. Write Remotion code placing chunks at correct frame offsets.
6. Render the video.
7. QA the rendered output with `inspect_asset(...)`.
8. Fix and re-render if needed.
