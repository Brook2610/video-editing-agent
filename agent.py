from __future__ import annotations

import json
import os
import sys
import base64
import mimetypes
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, TypedDict
from typing_extensions import Annotated

from dotenv import find_dotenv, load_dotenv
from google import genai

from langchain_core.messages import HumanMessage, SystemMessage, messages_from_dict, messages_to_dict
from langchain_core.tools import StructuredTool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_google_genai.chat_models import ChatGoogleGenerativeAIError
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from tools import PROJECTS_ROOT, ToolSpec, get_tools, ctx_project_id

BASE_DIR = Path(__file__).resolve().parent
PROMPT_PATH = BASE_DIR / "prompt.txt"
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
DEFAULT_MAX_STEPS = int(os.getenv("AGENT_MAX_STEPS", "100"))
LOG_PREFIX = "[video-agent]"
MAX_INLINE_BYTES = 20 * 1024 * 1024


@dataclass
class SkillMeta:
    name: str
    description: str
    path: Path


class AgentState(TypedDict):
    messages: Annotated[List[Any], add_messages]
    step: int
    max_steps: int


def _log(message: str) -> None:
    print(f"{LOG_PREFIX} {message}")


def _load_env() -> None:
    env_path = find_dotenv(usecwd=True)
    if env_path:
        load_dotenv(env_path)
        _log(f"Loaded env from {env_path}")
    else:
        _log("No .env found via find_dotenv")
    if os.getenv("GOOGLE_API_KEY_PREMIUM"):
        os.environ["GOOGLE_API_KEY"] = os.environ["GOOGLE_API_KEY_PREMIUM"]
    api_key = os.getenv("GOOGLE_API_KEY", "")
    premium_key = os.getenv("GOOGLE_API_KEY_PREMIUM", "")
    _log("API key present" if api_key else "API key missing")
    if premium_key:
        _log("Premium key detected in env")
        _log(f"Premium key suffix: ***{premium_key[-6:]}")
    if api_key:
        _log(f"Active key suffix: ***{api_key[-6:]}")

    if os.getenv("LANGSMITH_API_KEY"):
        os.environ.setdefault("LANGSMITH_TRACING", "true")
        os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
        os.environ.setdefault("LANGSMITH_PROJECT", "video-editing-agent")
        _log("LangSmith tracing enabled")


def _read_prompt() -> str:
    if PROMPT_PATH.exists():
        return PROMPT_PATH.read_text(encoding="utf-8")
    return "You are a video editing agent."


def _parse_frontmatter(content: str) -> Dict[str, str]:
    if not content.startswith("---"):
        return {}
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}
    frontmatter = parts[1].strip().splitlines()
    data: Dict[str, str] = {}
    for line in frontmatter:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def _find_skills(skill_dirs: List[Path]) -> List[SkillMeta]:
    skills: List[SkillMeta] = []
    seen_names: set[str] = set()
    for root in skill_dirs:
        if not root.exists():
            continue
        for skill_file in root.rglob("SKILL.md"):
            try:
                content = skill_file.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            meta = _parse_frontmatter(content)
            name = meta.get("name")
            description = meta.get("description")
            if name and description and name not in seen_names:
                skills.append(SkillMeta(name=name, description=description, path=skill_file))
                seen_names.add(name)
    return skills


def _skills_prompt_block(skills: List[SkillMeta]) -> str:
    if not skills:
        return ""
    lines = ["<available_skills>"]
    for skill in skills:
        lines.append("  <skill>")
        lines.append(f"    <name>{skill.name}</name>")
        lines.append(f"    <description>{skill.description}</description>")
        lines.append(f"    <location>{skill.path.as_posix()}</location>")
        lines.append("  </skill>")
    lines.append("</available_skills>")
    return "\n".join(lines)


def _select_active_skills(request: str, skills: List[SkillMeta]) -> List[SkillMeta]:
    text = (request or "").lower()
    active: List[SkillMeta] = []
    for skill in skills:
        if skill.name.lower() in text or "remotion" in text:
            active.append(skill)
    for skill in skills:
        if "remotion" in skill.name.lower() and skill not in active:
            if any(token in text for token in ["video", "edit", "editor", "remotion", "motion", "graphics"]):
                active.append(skill)
    return active


def _load_skill_text(skill: SkillMeta) -> str:
    try:
        return skill.path.read_text(encoding="utf-8", errors="ignore")
    except Exception as exc:
        return f"(Failed to load {skill.path}: {exc})"


def _mime_for_path(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".mp4": "video/mp4",
        ".mpeg": "video/mpeg",
        ".mov": "video/mov",
        ".avi": "video/avi",
        ".flv": "video/x-flv",
        ".mpg": "video/mpg",
        ".webm": "video/webm",
        ".wmv": "video/wmv",
        ".3gpp": "video/3gpp",
    }.get(ext, "video/mp4")


def _guess_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    return mime or "application/octet-stream"


def _build_asset_blocks(
    client: genai.Client,
    asset_paths: List[str],
) -> tuple[List[Dict[str, Any]], List[str], List[str]]:
    blocks: List[Dict[str, Any]] = []
    large_assets: List[str] = []
    inline_assets: List[str] = []

    for asset in asset_paths:
        path = Path(asset).expanduser().resolve()
        if not path.exists() or not path.is_file():
            _log(f"Asset not found: {asset}")
            continue
        size_bytes = path.stat().st_size
        mime_type = _guess_mime(path)

        if size_bytes > MAX_INLINE_BYTES:
            large_assets.append(path.name)
            continue

        inline_assets.append(path.name)
        if mime_type.startswith(("video/", "audio/", "image/")):
            data = path.read_bytes()
            encoded = base64.b64encode(data).decode("utf-8")
            if mime_type.startswith("video/"):
                blocks.append({"type": "video", "base64": encoded, "mime_type": mime_type})
            elif mime_type.startswith("audio/"):
                blocks.append({"type": "audio", "base64": encoded, "mime_type": mime_type})
            else:
                blocks.append({"type": "image", "base64": encoded, "mime_type": mime_type})
        elif mime_type.startswith("text/"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            blocks.append({"type": "text", "text": f"Asset {path.name}:\n{text}"})
        else:
            large_assets.append(path.name)

    return blocks, inline_assets, large_assets


def _build_video_input(client: genai.Client, source: str) -> Dict[str, Any]:
    if source.startswith("http://") or source.startswith("https://"):
        return {"type": "video", "url": source}
    path = Path(source).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Video not found: {source}")
    size_bytes = path.stat().st_size
    if size_bytes > 20 * 1024 * 1024:
        uploaded = client.files.upload(file=str(path))
        for _ in range(30):
            try:
                uploaded = client.files.get(name=uploaded.name)
            except Exception:
                pass
            if getattr(uploaded, "state", None) and getattr(uploaded.state, "name", "") == "ACTIVE":
                break
            time.sleep(1)
        return {"type": "video", "file_id": uploaded.uri, "mime_type": _mime_for_path(path)}
    data = path.read_bytes()
    encoded = base64.b64encode(data).decode("utf-8")
    return {"type": "video", "base64": encoded, "mime_type": _mime_for_path(path)}


def _memory_path(project: str) -> Path:
    return (PROJECTS_ROOT / project / ".memory.jsonl").resolve()


def _load_memory(project: str) -> List[Any]:
    path = _memory_path(project)
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        payload = [json.loads(line) for line in lines if line.strip()]
        return messages_from_dict(payload)
    except Exception:
        return []


def _save_memory(project: str, messages: List[Any]) -> None:
    path = _memory_path(project)
    path.parent.mkdir(parents=True, exist_ok=True)
    filtered = [msg for msg in messages if not isinstance(msg, SystemMessage)]
    data = messages_to_dict(filtered)
    with path.open("w", encoding="utf-8") as handle:
        for item in data:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")


def _build_tools() -> List[StructuredTool]:
    tools = []
    for tool_spec in get_tools():
        tools.append(
            StructuredTool.from_function(
                func=tool_spec.handler,
                name=tool_spec.name,
                description=tool_spec.description,
            )
        )
    return tools


def _build_system_prompt(request: str, project: str) -> str:
    skill_dirs = [
        BASE_DIR / "skills",
    ]
    _log("Scanning skills: " + ", ".join(p.as_posix() for p in skill_dirs))
    skills = _find_skills(skill_dirs)
    active_skills = _select_active_skills(request, skills)
    _log(f"Discovered skills: {len(skills)}")
    if skills:
        _log("Skills: " + ", ".join(s.name for s in skills))
    _log(f"Active skills: {len(active_skills)}")
    if active_skills:
        _log("Active: " + ", ".join(s.name for s in active_skills))

    available_skills_block = _skills_prompt_block(skills)
    active_skills_text = "\n\n".join(_load_skill_text(s) for s in active_skills) if active_skills else ""
    base_prompt = _read_prompt()
    
    project_root = (PROJECTS_ROOT / project).resolve()
    
    return "\n\n".join(
        block for block in [
            base_prompt,
            f"Project Root Directory: {project_root.as_posix()}",
            available_skills_block,
            "<active_skills>\n" + active_skills_text + "\n</active_skills>" if active_skills_text else "",
        ]
        if block
    )


def _build_initial_message(
    client: genai.Client,
    project: str,
    request: str,
    video_source: str,
    assets: Optional[List[str]] = None,
    include_project_header: bool = False,
) -> HumanMessage:
    asset_names = [Path(a).name for a in (assets or [])]
    header = f"Project name: {project}\n" if include_project_header else ""
    user_text = header + request.strip() + "\n"
    if asset_names:
        user_text += f"Attached assets: {', '.join(asset_names)}\n"
    parts: List[Dict[str, Any]] = []
    inline_assets: List[str] = []
    large_assets: List[str] = []
    if video_source and video_source.lower() not in {"none", "no-video", "-"}:
        _log("Preparing video input")
        parts.append(_build_video_input(client, video_source))
    if assets:
        _log(f"Preparing {len(assets)} asset(s)")
        asset_blocks, inline_assets, large_assets = _build_asset_blocks(client, assets)
        parts.extend(asset_blocks)
    if large_assets:
        user_text += "Large assets available (use tools to inspect_asset): " + ", ".join(large_assets) + "\n"
    if inline_assets:
        user_text += "Inline assets attached: " + ", ".join(inline_assets) + "\n"
    parts.append({"type": "text", "text": user_text})
    if parts and len(parts) > 1:
        return HumanMessage(content=parts)
    _log("No video provided; using text-only request")
    return HumanMessage(content=user_text)


def _invoke_with_retry(model: ChatGoogleGenerativeAI, messages: List[Any]) -> Any:
    delays = [2, 4, 8]
    for attempt, delay in enumerate([0] + delays):
        if attempt > 0:
            _log(f"Retrying model call in {delay}s (attempt {attempt + 1}/{len(delays) + 1})")
            time.sleep(delay)
        try:
            return model.invoke(messages)
        except Exception as exc:
            if attempt >= len(delays):
                raise
            _log(f"Model call failed: {exc}")


def _build_graph(model: ChatGoogleGenerativeAI, tools: List[StructuredTool]) -> StateGraph:
    tool_node = ToolNode(tools)

    def _call_model(state: AgentState) -> AgentState:
        messages = state["messages"]
        _log(f"Turn {state['step'] + 1}: invoking model (messages={len(messages)})")
        response = _invoke_with_retry(model, messages)
        tool_calls = getattr(response, "tool_calls", None) or []
        if tool_calls:
            _log(f"Model returned {len(tool_calls)} tool call(s)")
            for call in tool_calls:
                _log(f"Tool requested: {call.get('name')} args={call.get('args')}")
        else:
            preview = getattr(response, "text", None) or str(response)
            preview_clean = preview[:120].replace("\n", " ")
            _log(f"Model response preview: {preview_clean}")
        return {"messages": [response], "step": state["step"] + 1}

    def _has_tool_calls(state: AgentState) -> str:
        messages = state["messages"]
        last = messages[-1]
        if state["step"] >= state["max_steps"]:
            _log("Max steps reached; stopping graph.")
            return END
        if getattr(last, "tool_calls", None):
            return "tools"
        return END

    graph = StateGraph(AgentState)
    graph.add_node("agent", _call_model)
    graph.add_node("tools", tool_node)
    graph.add_conditional_edges("agent", _has_tool_calls, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    graph.set_entry_point("agent")
    compiled = graph.compile()
    return compiled


def run_agent(
    video_source: str,
    request: str,
    project: str,
    model: str,
    max_steps: int,
    assets: Optional[List[str]] = None,
) -> str:
    ctx_project_id.set(project)
    _log(f"Using project context: {project}")

    _load_env()

    if not os.getenv("GOOGLE_API_KEY"):
        raise RuntimeError("Missing GOOGLE_API_KEY in environment")

    _log(f"Model: {model}")
    _log(f"Project: {project}")
    _log(f"Max steps: {max_steps}")
    _log(f"Request: {request}")
    _log(f"Video source: {video_source}")

    client = genai.Client()
    system_prompt = _build_system_prompt(request, project)
    tools = _build_tools()
    tool_names = ", ".join(t.name for t in tools)
    _log(f"Tools: {tool_names}")

    llm = ChatGoogleGenerativeAI(
        model=model,
        temperature=1.0,
        max_retries=2,
    ).bind_tools(tools)

    memory_messages = _load_memory(project)
    _log(f"Memory messages loaded: {len(memory_messages)}")

    messages: List[Any] = [SystemMessage(content=system_prompt)]
    messages.extend(memory_messages)
    include_project_header = len(memory_messages) == 0
    messages.append(
        _build_initial_message(
            client,
            project,
            request,
            video_source,
            assets=assets,
            include_project_header=include_project_header,
        )
    )

    graph = _build_graph(llm, tools)
    state = {"messages": messages, "step": 0, "max_steps": max_steps}
    try:
        result = graph.invoke(state, config={"recursion_limit": max_steps * 2})
    except ChatGoogleGenerativeAIError as exc:
        key = os.getenv("GOOGLE_API_KEY", "")
        suffix = key[-6:] if key else "(missing)"
        _log(f"API key suffix in use: ***{suffix}")
        raise
    new_messages = result["messages"]

    _save_memory(project, new_messages)
    _log(f"Memory messages saved: {len(new_messages)}")

    last = new_messages[-1]
    return getattr(last, "text", None) or str(last)


def main() -> int:
    if len(sys.argv) < 4:
        print("Usage: python agent.py <video_path_or_url> <project_name> <request>")
        return 1
    video_source = sys.argv[1]
    project = sys.argv[2]
    request = " ".join(sys.argv[3:])
    response = run_agent(
        video_source=video_source,
        request=request,
        project=project,
        model=DEFAULT_MODEL,
        max_steps=DEFAULT_MAX_STEPS,
        assets=None,
    )
    print(response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
