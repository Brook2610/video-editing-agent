# Video Editing Agent

AI-powered video editing assistant with a FastAPI backend and a web UI. It manages per-project assets, runs an agent for editing tasks, and can render outputs.

## Features
- Project/session management
- Asset upload and preview
- Chat-based editing workflow
- Output listing and playback

## Requirements
- Python 3.10+
- Node.js 18+ (for any Remotion-based workflows)
- ffmpeg

## Local Setup
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file:
```
GOOGLE_API_KEY=your_key_here
GEMINI_MODEL=gemini-3-flash-preview
AGENT_MAX_STEPS=100
```

Run the app:
```bash
python app.py
```

Open: http://localhost:8000

## Notes
- Project files live under `projects/` (git-ignored).
- Assets live in `projects/<session>/public/assets`.
- Outputs live in `projects/<session>/out`.
- Agent memory uses LangGraph SQLite checkpoints at `projects/<session>/.langgraph-checkpoint.db`.
- A rolling summary is stored at `projects/<session>/.memory-summary.txt`.
- UI history export remains at `projects/<session>/.memory.jsonl` and is capped.
- Memory tuning values are hardcoded in `agent.py` (not env-driven).

---

# Video Editor Agent - Project Story

## Inspiration
- Cawd Bot (OpenClaw) and Remotion showed what was possible.
- Real editing pain: slow manual cuts, repetitive motion-graphics work, and too many tool switches.

## What it does
- Edits videos using a Gemini-powered agent.
- Accepts a natural-language request, plans the edit, writes Remotion code, and renders outputs.

## How we built it
- **Gemini 3 for coding** for the core agent reasoning and coding. It drives the workflow end-to-end:
	- Plans editing steps and timelines.
	- Generates Remotion React components.
	- Fixes issues and retries renders when needed.
- **Multimodal Gemini** capabilities for understanding video, image, and audio inputs:
	- Video analysis for scene understanding and key moments.
	- Image inspection for overlays, graphics, and style cues.
	- Audio inspection for timing and pacing.
- **LangChain + LangGraph** for orchestration, tool calling, and structured agent loops.
- **Remotion** as the video engine, producing consistent, programmable edits.
- **Google Cloud VM** to run the service with stable compute and fast deployment.

## Challenges we ran into
- Rendering can be slow depending on complexity, assets, and machine load.
- Occasional model load hiccups (Gemini availability or cold-start latency).

## Accomplishments that we're proud of
- A clean, usable web interface that makes editing approachable.
- The agent can generate and render complete videos from a single prompt.

## What we learned
- Gemini's multimodal understanding is strong for video, image, and audio context.
- Prompt and context engineering matters a lot for consistent editing results.

## What's next for Video Editor Agent
- Expand tooling and skills for more editing styles and effects.
- Improve reliability and speed for rendering.
- Collaborate directly with video editors to refine the workflow.
