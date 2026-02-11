# Supported Languages

## How Language Works in Gemini TTS

- The TTS model **auto-detects** input language — no explicit language parameter is needed.
- Simply write the text in the desired language, and the model speaks it in that language.
- For accent or pronunciation control, include instructions in `style_prompt`.

## Complete Language List

The following languages are supported by Gemini TTS models:

### Tier 1 — Major Languages
| Language | Code |
|----------|------|
| Arabic | ar |
| Chinese, Mandarin | cmn |
| Dutch | nl |
| English | en |
| French | fr |
| German | de |
| Hindi | hi |
| Indonesian | id |
| Italian | it |
| Japanese | ja |
| Korean | ko |
| Polish | pl |
| Portuguese | pt |
| Romanian | ro |
| Russian | ru |
| Spanish | es |
| Thai | th |
| Turkish | tr |
| Vietnamese | vi |

### Tier 2 — Widely Supported
| Language | Code |
|----------|------|
| Bangla / Bengali | bn |
| Bulgarian | bg |
| Catalan | ca |
| Croatian | hr |
| Czech | cs |
| Danish | da |
| Estonian | et |
| Filipino | fil |
| Finnish | fi |
| Greek | el |
| Gujarati | gu |
| Hebrew | he |
| Hungarian | hu |
| Kannada | kn |
| Latvian | lv |
| Lithuanian | lt |
| Malay | ms |
| Malayalam | ml |
| Marathi | mr |
| Norwegian Bokmål | nb |
| Norwegian Nynorsk | nn |
| Persian | fa |
| Punjabi | pa |
| Serbian | sr |
| Slovak | sk |
| Slovenian | sl |
| Swahili | sw |
| Swedish | sv |
| Tamil | ta |
| Telugu | te |
| Ukrainian | uk |
| Urdu | ur |

### Tier 3 — Additional Languages
| Language | Code |
|----------|------|
| Afrikaans | af |
| Albanian | sq |
| Amharic | am |
| Armenian | hy |
| Azerbaijani | az |
| Basque | eu |
| Belarusian | be |
| Burmese | my |
| Cebuano | ceb |
| Galician | gl |
| Georgian | ka |
| Haitian Creole | ht |
| Icelandic | is |
| Javanese | jv |
| Konkani | kok |
| Lao | lo |
| Latin | la |
| Luxembourgish | lb |
| Macedonian | mk |
| Maithili | mai |
| Malagasy | mg |
| Mongolian | mn |
| Nepali | ne |
| Odia | or |
| Pashto | ps |
| Sindhi | sd |
| Sinhala | si |

## Practical Language Workflow

### Standard Workflow
1. Write the narration text in the target language.
2. Call `generate_speech(text=<text_in_target_language>)`.
3. The model auto-detects and speaks in that language.

### When Accent / Pronunciation Matters
1. Add language and accent guidance in `style_prompt`:
   ```python
   generate_speech(
       text="Bienvenue à notre présentation.",
       voice_name="Kore",
       style_prompt="Speak in French with a standard Parisian accent. Clear, professional tone."
   )
   ```
2. Generate a short pilot sample first (one sentence).
3. Use `inspect_asset(...)` to QA pronunciation before generating the full script.

### Handling Proper Nouns and Tricky Words
- Add pronunciation hints in `style_prompt`:
  ```
  Pronounce "Nguyen" as "win". Say "PyTorch" as "pie-torch".
  ```
- If mispronunciation persists, try phonetic spelling in the text itself.
- Split lines with difficult words into shorter chunks for better control.

### Mixed-Language Content
- The model handles mixed-language text (e.g., English with French phrases) reasonably well.
- For best results, keep each chunk predominantly in one language.
- If switching languages mid-sentence is needed, include explicit guidance in `style_prompt`.

### Languages Not in the List
- If the user requests a language not listed above, try it anyway — generate a short sample and QA it.
- The model may partially support unlisted languages.
- Clearly inform the user if quality is poor and suggest alternatives.
