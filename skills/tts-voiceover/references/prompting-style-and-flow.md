# Prompting Style and Flow — Detailed Guide

## Overview

Gemini TTS is not a traditional text-to-speech engine. It uses a large language model that understands **what** to say and **how** to say it. Think of yourself as a director giving instructions to a voice actor. The more vivid and specific your direction, the better the performance.

The `style_prompt` parameter is your directorial tool. It gets prepended to the text, forming the full prompt sent to the TTS model.

## Prompt Structure

A robust TTS prompt has up to five elements. Not all are required — use what the task demands.

### 1. Audio Profile (Who Is Speaking)
Establish the character's identity. Giving them a name helps ground the performance.

```
# AUDIO PROFILE: Marcus
## "The Tech Reviewer"
Marcus is a mid-30s tech journalist. Confident, articulate, always slightly amused.
```

**When to use**: Character-driven narration, recurring speakers, branded voices.
**Skip when**: Simple one-off narration with no character identity.

### 2. Scene (The Environment)
Set the physical and emotional context. This subtly shapes delivery.

```
## THE SCENE: Late Night Studio
A dimly lit podcast studio at 2 AM. Marcus is leaning into the mic, coffee in hand.
The tone is intimate, like talking to one person, not a crowd.
```

**When to use**: Narrative projects, dramatic scenes, immersive content.
**Skip when**: Straightforward informational narration.

### 3. Director's Notes (Performance Guidance)
The most important element. Controls style, pacing, accent, and vocal technique.

This is the section you should **always** include for anything beyond basic narration.

#### Style
Sets tone and emotional color. Be descriptive — "infectious enthusiasm" works better than "energetic".

Simple:
```
Style: Calm and professional.
```

Moderate:
```
Style: Warm documentary narrator with quiet authority. The listener should feel informed, not lectured.
```

Complex:
```
Style:
* "Vocal Smile": The grin must be audible. Bright, inviting tone.
* Dynamics: High projection without shouting. Punchy consonants, elongated vowels on excitement words.
```

Industry voiceover terms work well: "vocal smile", "proximity effect", "read cold", "hard sell", "soft sell".

#### Pacing
Controls speed, rhythm, and pause behavior.

Simple:
```
Pacing: Speak slowly and clearly.
```

Moderate:
```
Pacing: Medium pace. Pause briefly after each key fact. Speed up slightly during examples.
```

Complex:
```
Pacing: The "Drift" — incredibly slow and liquid. Words bleed into each other. Zero urgency.
Pauses: 1-second pause after each sentence ending. Half-second pause before any proper noun.
```

Tips:
- Punctuation in the text itself affects pauses: periods = long pause, commas = short pause, "..." = trailing pause.
- To force a longer pause, you can add "..." or "[pause]" in the text.
- For hard sync points (matching video moments), control timing through text length rather than pacing prompts.

#### Accent
Specify regional accent precisely. More specific = better results.

Good:
```
Accent: British English, Received Pronunciation.
```

Better:
```
Accent: London Estuary English, specifically Brixton inflections.
```

```
Accent: Southern California valley girl from Laguna Beach.
```

```
Accent: Indian English as spoken in Bangalore, with Hindi-influenced intonation.
```

Vague accents like "British" or "American" give generic results.

### 4. Sample Context (Optional Setup)
Gives the model a running start — what just happened, what comes next.

```
### SAMPLE CONTEXT
Marcus just finished reviewing a disappointing smartphone. He's transitioning to the next product,
which he actually loved. His energy should noticeably lift.
```

**When to use**: Mid-scene narration, when emotional transition matters.
**Skip when**: Standalone clips with no narrative context.

### 5. Transcript
The actual text to be spoken. This always comes last.

```
#### TRANSCRIPT
And then we get to the Galaxy S30, and honestly? This is the one I've been 
waiting for. Three weeks with this thing and I still reach for it first 
every morning.
```

## Complete Example Prompt

Here's how all five elements come together in a `style_prompt` + `text` call:

**style_prompt:**
```
# AUDIO PROFILE: Jaz R.
## "The Morning Hype"

## THE SCENE: The London Studio
10 PM in a glass-walled studio overlooking the moonlit London skyline,
but inside it's blindingly bright. The red "ON AIR" light is blazing.
Jaz is standing, bouncing on their heels to a thumping backing track.

### DIRECTOR'S NOTES
Style:
* "Vocal Smile": The grin must be audible. Bright, sunny, inviting.
* Dynamics: High projection without shouting. Punchy consonants, elongated vowels on excitement words.

Pacing: Energetic and fast. "Bouncing" cadence. High-speed delivery with fluid transitions — no dead air.

Accent: Brixton, London.

### SAMPLE CONTEXT
Jaz is the go-to voice for Top 40 radio and high-octane event promos.

Read this text exactly:
```

**text:**
```
Yes, massive vibes in the studio! You are locked in and it is absolutely
popping off in London right now. If you're stuck on the tube, or just sat
there pretending to work... stop it. Seriously, I see you. Turn this up!
```

## Quick Style Recipes

For common scenarios, use these ready-made `style_prompt` patterns:

### Documentary Narrator
```
Speaker: Confident documentary narrator, warm and clear.
Audience: General audience, educational content.
Delivery: Medium pace, lightly emphatic on key facts, short pauses after sentences.
```

### Product Demo
```
Speaker: Friendly product specialist, approachable and knowledgeable.
Delivery: Conversational pace, enthusiasm on feature names, professional but not stiff.
```

### Dramatic Trailer
```
Speaker: Epic movie trailer voice.
Delivery: Deep, slow, building intensity. Long pauses between phrases. Maximum gravitas.
```

### Children's Story
```
Speaker: Warm, gentle storyteller reading a bedtime story.
Delivery: Very slow, exaggerated intonation, playful on character dialogue, soothing overall.
```

### News/Report
```
Speaker: Professional news anchor.
Delivery: Even pace, authoritative, clear enunciation, minimal emotion.
```

### Podcast Host
```
Speaker: Casual podcast host talking to friends.
Delivery: Natural, relaxed pace, occasional laughter-adjacent warmth, conversational.
```

## Pronunciation Guidance

### Proper Nouns
Add explicit pronunciation to `style_prompt`:
```
Pronunciation:
- Say "Nguyen" as "win"
- Say "GPU" as "G-P-U"
- Say "PyTorch" as "pie-torch"
- Say "GIF" with a hard G
```

### Acronyms
- Spell them out if the model should read letter-by-letter: `"Pronounce API as A-P-I."`
- Leave them as-is if the model should read as a word: `"Read NASA as a word, not letters."`

### Numbers and Dates
- Write out numbers if specific pronunciation matters: "twenty twenty-six" vs "2026".
- For phone numbers, add formatting: "one-eight-hundred-five-five-five" or spaces between digits.

### Testing Pronunciation
Always test tricky words with a short pilot sample before committing to a full script. One sentence is enough. If still wrong:
1. Try phonetic spelling in the text.
2. Try more explicit pronunciation instructions in `style_prompt`.
3. Split the problematic line into its own chunk.

## Tips for Consistent Multi-Chunk Narration

When generating many chunks for one video:

1. **Same voice**: Keep `voice_name` identical across all chunks.
2. **Same style_prompt base**: Use the same Audio Profile and Director's Notes for all chunks. Only vary the Sample Context if needed.
3. **Small style adjustments only**: Don't swing from "calm" to "excited" between consecutive chunks unless the scene demands it. Gradual shifts sound natural.
4. **Sentence endings**: End each chunk on a complete sentence to avoid awkward cuts.
5. **Test transitions**: Render two adjacent chunks and listen to the join point. If jarring, adjust pacing or add fade.

## What NOT to Do

- **Don't over-specify**: Too many strict rules limit the model's natural expressiveness. Give direction, not a rigid script for how every syllable should sound.
- **Don't conflict**: A calm, relaxed style with "speak as fast as possible" pacing creates confusion. Keep direction coherent.
- **Don't mix voice and style**: Pairing an "Upbeat" voice with "bored and monotone" styling fights the voice's natural character.
- **Don't skip testing**: Always pilot-test style prompts with a short line before generating full narration.
