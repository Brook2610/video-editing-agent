from __future__ import annotations

import fnmatch
from dataclasses import dataclass
from pathlib import Path
import subprocess
from typing import Any, Callable, Dict, List, Optional
import mimetypes
import os
import time
from google import genai

from contextvars import ContextVar

# Context variable to store current project ID (e.g. "3")
# This ensures tools operation ONLY within the active project directory
ctx_project_id: ContextVar[str] = ContextVar("project_id", default="")

PROJECTS_ROOT = (Path(__file__).resolve().parent / "projects").resolve()
SKILLS_ROOT = (Path(__file__).resolve().parent / "skills").resolve()


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: Dict[str, Any]
    handler: Callable[..., Any]


def _safe_project_path(path: str) -> Path:
    """Validate path is within the SPECIFIC project directory."""
    project_id = ctx_project_id.get()
    if not project_id:
        # Fallback for when context is not set (should not happen in agent run)
        # But for 'list_files(".")' case without context, it would list root.
        # We want to prevent root listing generally.
        root = PROJECTS_ROOT
    else:
        root = (PROJECTS_ROOT / project_id).resolve()

    # If path is absolute, try to make it relative to root
    # But generally inputs are relative paths.
    # We treat input 'path' as relative to the PROJECT root.
    
    # Handle absolute paths that might have naturally occurred (e.g. from previous output)
    path_path = Path(path)
    if path_path.is_absolute():
        try:
            # Try to make it relative to root
            rel = path_path.relative_to(root)
            target = (root / rel).resolve()
        except ValueError:
            # If not relative to specific project root, fail
             raise ValueError(f"Path must be inside project directory '{project_id}'")
    else:
        target = (root / path).resolve()

    if not str(target).lower().startswith(str(root).lower()):
        raise ValueError(f"Path escapes project directory '{project_id}'")
        
    return target


def _safe_skills_path(path: str) -> Path:
    """Validate path is within skills directory."""
    target = (SKILLS_ROOT / path).resolve()
    if not str(target).lower().startswith(str(SKILLS_ROOT).lower()):
        raise ValueError("Path escapes skills directory")
    return target


def _resolve_read_path(path: str) -> Path:
    """Resolve a path for reading - allows both projects and skills directories."""
    # Check if path starts with "skills/" prefix
    if path.startswith("skills/") or path.startswith("skills\\"):
        # Strip the prefix and resolve from skills root
        skills_path = path[7:]  # Remove "skills/" prefix
        return _safe_skills_path(skills_path)
    
    # Otherwise, treat as project path
    return _safe_project_path(path)


def _asset_dir(project: str) -> Path:
    return _safe_project_path(str(Path(project) / "assets"))


from events import emit


def list_files(path: str = ".", pattern: str = "*", recursive: bool = True) -> List[str]:
    try:
        base = _safe_project_path(path)
    except ValueError as e:
        return [f"Error: {e}"]
    
    if not base.exists() or not base.is_dir():
        return []
    
    matches: List[str] = []
    MAX_FILES = 500
    
    # Exclude common heavy directories
    EXCLUDES = {
        "node_modules", "__pycache__", ".git", ".vscode", ".idea", 
        "venv", "env", "dist", "build", "coverage"
    }

    if not recursive:
        # Non-recursive (shallow) list
        for p in base.iterdir():
            if p.is_file() and not p.name.startswith("."):
                rel = p.name
                if fnmatch.fnmatch(rel, pattern):
                    matches.append(rel)
        return sorted(matches)

    # Recursive list with exclusion
    for root, dirs, files in os.walk(str(base)):
        # Modify dirs in-place to skip excluded and hidden directories
        dirs[:] = [d for d in dirs if d not in EXCLUDES and not d.startswith(".")]
        
        root_path = Path(root)
        for name in files:
            if name.startswith("."):
                continue
                
            p = root_path / name
            try:
                rel = str(p.relative_to(base)).replace("\\", "/")
            except ValueError:
                continue
                
            if fnmatch.fnmatch(rel, pattern):
                matches.append(rel)
                
        if len(matches) >= MAX_FILES:
            matches.append(f"... (truncated, max {MAX_FILES} files)")
            break
            
    # ... (no change needed here, just confirming)
    return sorted(matches)


def list_skills() -> List[Dict[str, Any]]:
    """List all available skills with their names and file contents."""
    if not SKILLS_ROOT.exists() or not SKILLS_ROOT.is_dir():
        return []
    
    skills = []
    for skill_dir in SKILLS_ROOT.iterdir():
        if skill_dir.is_dir():
            skill_md = skill_dir / "SKILL.md"
            if skill_md.exists():
                # List all files in the skill directory
                files = []
                for f in skill_dir.rglob("*"):
                    if f.is_file():
                        files.append(str(f.relative_to(SKILLS_ROOT)).replace("\\", "/"))
                
                skills.append({
                    "name": skill_dir.name,
                    "path": f"skills/{skill_dir.name}/SKILL.md",
                    "files": files,
                })
    
    return skills


def search_files(query: str, path: str = ".", pattern: str = "*") -> List[Dict[str, Any]]:
    try:
        base = _safe_project_path(path)
    except ValueError as e:
        return [{"error": str(e)}]
    
    if not base.exists() or not base.is_dir():
        return []
        
    results: List[Dict[str, Any]] = []
    # Reuse list_files logic to get candidate files (respecting excludes)
    candidates = list_files(path, pattern, recursive=True)
    
    for rel_path in candidates:
        if isinstance(rel_path, str) and rel_path.startswith("..."):
            continue
            
        p = base / rel_path
        try:
            # Skip non-text files quickly
            mime, _ = mimetypes.guess_type(str(p))
            # Heuristic: if mime is known and not text/json/js, skip. 
            # But many code files have no mime or application/x- types, so be permissive.
            if mime and not mime.startswith("text/") and mime not in [
                "application/json", "application/javascript", "application/xml", "application/x-sh"
            ]:
                # If mimetypes thinks it's strictly binary (video, image, audio), skip
                if mime.startswith(("video/", "image/", "audio/")):
                    continue
                
            text = p.read_text(encoding="utf-8", errors="ignore")
            
            lines = text.splitlines()
            for i, line in enumerate(lines):
                if query.lower() in line.lower():
                    # context snippet
                    start = max(0, i - 1)
                    end = min(len(lines), i + 2)
                    snippet = "\n".join(lines[start:end])
                    results.append({
                        "file": rel_path,
                        "line": i + 1,
                        "snippet": snippet
                    })
                    if len(results) >= 50:
                        break
        except Exception:
            continue
            
        if len(results) >= 50:
            break
            
    return results


def read_file(path: str, start_line: Optional[int] = None, end_line: Optional[int] = None) -> str:
    """Read a file from projects directory or skills directory (if path starts with 'skills/')."""
    try:
        p = _resolve_read_path(path)
    except ValueError as e:
        return str(e)
    
    if not p.exists() or not p.is_file():
        return f"File not found: {path}"
    text = p.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    total = len(lines)
    s = 1 if start_line is None or start_line < 1 else start_line
    e = total if end_line is None or end_line < 1 else end_line
    if s > total:
        return f"Requested lines {s}-{e}, but file has only {total} lines."
    e = min(e, total)
    chunk = "\n".join(lines[s - 1 : e])
    return f"[read_file] {path}: lines {s}-{e}/{total}\n" + chunk


def write_file(path: str, content: str, overwrite: bool = False) -> str:
    try:
        p = _safe_project_path(path)
    except ValueError as e:
        return str(e)

    if p.exists() and not overwrite:
        return f"File already exists: {path}"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return f"Wrote {path} ({len(content)} bytes)"


def make_dir(path: str) -> str:
    try:
        p = _safe_project_path(path)
    except ValueError as e:
        return str(e)
        
    p.mkdir(parents=True, exist_ok=True)
    return f"Created directory: {path}"


def _find_subsequence(haystack: List[str], needle: List[str]) -> int:
    if not needle:
        return -1
    for i in range(0, len(haystack) - len(needle) + 1):
        if haystack[i : i + len(needle)] == needle:
            return i
    return -1


def _apply_hunk(file_lines: List[str], hunk_lines: List[str]) -> Optional[List[str]]:
    before: List[str] = []
    after: List[str] = []
    for line in hunk_lines:
        if not line:
            continue
        prefix = line[0]
        body = line[1:] if len(line) > 1 else ""
        if prefix == " ":
            before.append(body)
            after.append(body)
        elif prefix == "-":
            before.append(body)
        elif prefix == "+":
            after.append(body)
    start = _find_subsequence(file_lines, before)
    if start == -1:
        return None
    return file_lines[:start] + after + file_lines[start + len(before) :]


def apply_patch(patch: str) -> Dict[str, Any]:
    lines = (patch or "").splitlines()
    applied: List[Dict[str, str]] = []
    errors: List[str] = []

    i = 0
    while i < len(lines):
        line = lines[i].strip("\r")
        if line.startswith("*** Add File:"):
            path = line.split(":", 1)[1].strip()
            i += 1
            content_lines: List[str] = []
            while i < len(lines) and not lines[i].startswith("*** "):
                raw = lines[i]
                if raw.startswith("+"):
                    content_lines.append(raw[1:])
                else:
                    content_lines.append(raw)
                i += 1
            try:
                write_file(path, "\n".join(content_lines), overwrite=False)
                applied.append({"file": path, "message": "added"})
            except Exception as exc:
                errors.append(f"Add File failed for {path}: {exc}")
            continue

        if line.startswith("*** Delete File:"):
            path = line.split(":", 1)[1].strip()
            try:
                p = _safe_project_path(path)
                if p.exists():
                    p.unlink()
                    applied.append({"file": path, "message": "deleted"})
                else:
                    errors.append(f"Delete File failed for {path}: not found")
            except Exception as exc:
                errors.append(f"Delete File failed for {path}: {exc}")
            i += 1
            continue

        if line.startswith("*** Update File:"):
            path = line.split(":", 1)[1].strip()
            i += 1
            hunk: List[str] = []
            hunks: List[List[str]] = []
            while i < len(lines) and not lines[i].startswith("*** "):
                raw = lines[i]
                if raw.startswith("@@"):
                    if hunk:
                        hunks.append(hunk)
                        hunk = []
                elif raw.startswith((" ", "+", "-")):
                    hunk.append(raw)
                i += 1
            if hunk:
                hunks.append(hunk)
            try:
                p = _safe_project_path(path)
                if not p.exists():
                    errors.append(f"Update File failed for {path}: not found")
                    continue
                file_lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
                updated = file_lines
                for h in hunks:
                    result = _apply_hunk(updated, h)
                    if result is None:
                        errors.append(f"Update File failed for {path}: hunk not found")
                        result = updated
                        break
                    updated = result
                p.write_text("\n".join(updated), encoding="utf-8")
                applied.append({"file": path, "message": "updated"})
            except Exception as exc:
                errors.append(f"Update File failed for {path}: {exc}")
            continue

        i += 1

    return {"applied": applied, "errors": errors}


def run_terminal(command: str, cwd: str = ".", timeout: int = 120) -> str:
    if not command or not command.strip():
        return "No command provided."
    try:
        workdir = _safe_project_path(cwd)
    except ValueError as e:
        return f"Error: {e}"
    if not workdir.exists() or not workdir.is_dir():
        return f"Working directory not found: {cwd}"

    def _run(cmd: List[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            cmd,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=timeout,
        )

    try:
        # Prefer PowerShell on Windows, fallback to bash on Unix.
        if os.name == "nt":
            result = _run(["powershell", "-NoProfile", "-Command", command])
        else:
            result = _run(["/bin/bash", "-lc", command])
    except FileNotFoundError:
        # Fallback if the preferred shell isn't available.
        try:
            result = _run(["/bin/sh", "-lc", command])
        except Exception as exc:
            return f"Command failed to run: {exc}"
    except subprocess.TimeoutExpired:
        return f"Command timed out after {timeout}s"
    except Exception as exc:
        return f"Command failed to run: {exc}"

    output = (result.stdout or "") + (result.stderr or "")
    output = output.strip()
    if len(output) > 4000:
        output = output[:4000] + "\n... (output truncated)"
    return output or f"Command finished with exit code {result.returncode}"


def get_asset_info(asset_path: str) -> Dict[str, Any]:
    # We ignore 'project' argument as we use ctx_project_id
    try:
        # Resolve relative to project root, not strict assets dir
        target = _safe_project_path(asset_path)
    except ValueError as e:
        return {"error": str(e)}

    # Ensure it's inside the project (redundant with _safe_project_path but safe)
    # No need to check "escapes assets directory" specifically, just project directory.
    
    if not target.exists() or not target.is_file():
        return {"error": f"Asset not found: {asset_path}"}
    
    size = target.stat().st_size
    mime, _ = mimetypes.guess_type(str(target))
    info = {
        "path": asset_path,
        "size_bytes": size,
        "mime_type": mime or "application/octet-stream",
    }
    
    # Attempt to get detailed media info using ffprobe if installed
    try:
        cmd = [
            "ffprobe", 
            "-v", "error", 
            "-show_entries", "format=duration:stream=width,height,codec_name,codec_type", 
            "-of", "json", 
            str(target)
        ]
        # We need to run this command. subprocess.run is safe here.
        # We use a timeout to prevent hanging.
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            import json
            probe_data = json.loads(result.stdout)
            
            # Format info
            if "format" in probe_data and "duration" in probe_data["format"]:
                info["duration_seconds"] = float(probe_data["format"]["duration"])
            
            streams = probe_data.get("streams", [])
            video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
            audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
            
            if video_stream:
                info["width"] = video_stream.get("width")
                info["height"] = video_stream.get("height")
                info["video_codec"] = video_stream.get("codec_name")
            if audio_stream:
                info["audio_codec"] = audio_stream.get("codec_name")
                
    except Exception:
        # ffprobe might not be installed or failed, just return basic info
        info["note"] = "Detailed media info unavailable (ffprobe not found or failed)"
        pass
        
    return info


def inspect_asset(asset_path: str, prompt: str = "") -> str:
    """Analyze an asset (video, audio, image) using Gemini multimodal capabilities."""
    try:
        # Resolve relative to project root
        target = _safe_project_path(asset_path)
    except ValueError as e:
        return f"Error: {e}"
        
    if not target.exists() or not target.is_file():
        return f"Asset not found: {asset_path}"

    # Default prompt optimized for video editing workflow
    if not prompt.strip():
        prompt = """Analyze this asset thoroughly for video editing purposes:
1. Describe the overall content and mood.
2. List key scenes/moments with timestamps (MM:SS format).
3. Note any dialogue, text overlays, or audio cues.
4. Identify visual elements: colors, composition, transitions.
5. Suggest potential edit points or highlights."""

    client = genai.Client()
    uploaded = client.files.upload(file=str(target))
    
    # Wait for file processing (required for videos)
    for _ in range(60):  # Increased timeout for larger files
        try:
            uploaded = client.files.get(name=uploaded.name)
        except Exception:
            pass
        if getattr(uploaded, "state", None) and getattr(uploaded.state, "name", "") == "ACTIVE":
            break
        time.sleep(1)
    
    if not getattr(uploaded, "state", None) or getattr(uploaded.state, "name", "") != "ACTIVE":
        return "Asset is still processing. Please retry in a few seconds."
    
    response = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-3-flash-preview"),
        contents=[uploaded, prompt],
    )
    return response.text or ""


def _parse_timestamp(value: Optional[object]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if ":" in text:
            parts = [p for p in text.split(":") if p != ""]
            if len(parts) == 2:
                minutes, seconds = parts
                return float(minutes) * 60 + float(seconds)
            if len(parts) == 3:
                hours, minutes, seconds = parts
                return float(hours) * 3600 + float(minutes) * 60 + float(seconds)
        try:
            return float(text)
        except ValueError:
            return None
    return None


def set_view_asset(asset_path: str, timestamp: Optional[object] = None) -> Dict[str, Any]:
    """Request the UI to open an asset in View mode (optionally at a timestamp)."""
    try:
        target = _safe_project_path(asset_path)
    except ValueError as e:
        return {"error": str(e)}

    if not target.exists() or not target.is_file():
        return {"error": f"Asset not found: {asset_path}"}

    project_id = ctx_project_id.get()
    assets_dir = (PROJECTS_ROOT / project_id / "public" / "assets").resolve()
    outputs_dir = (PROJECTS_ROOT / project_id / "out").resolve()

    payload: Dict[str, Any] = {
        "updated": int(time.time() * 1000),
        "timestamp": _parse_timestamp(timestamp),
    }

    if str(target).startswith(str(outputs_dir)):
        rel = str(target.relative_to(outputs_dir)).replace("\\", "/")
        payload.update({"kind": "output", "path": rel})
    elif str(target).startswith(str(assets_dir)):
        rel = str(target.relative_to(assets_dir)).replace("\\", "/")
        payload.update({"kind": "asset", "path": rel})
    else:
        return {"error": "Asset must be inside public/assets or out directory"}

    ok = emit(project_id, "view", payload)
    if not ok:
        return {"error": "Failed to emit view event (event loop not ready)"}
    return {"success": True, **payload}


def get_tools() -> List[ToolSpec]:
    return [
        ToolSpec(
            name="list_files",
            description="List files under the projects directory. Skips hidden and heavy directories like node_modules.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Subdirectory under projects."},
                    "pattern": {"type": "string", "description": "Glob pattern for filtering (default *)"},
                    "recursive": {"type": "boolean", "description": "Whether to list recursively (default True)"},
                },
            },
            handler=list_files,
        ),
        ToolSpec(
            name="list_skills",
            description="List all available skills with their names and files. Use read_file with 'skills/...' path to read skill contents.",
            parameters={
                "type": "object",
                "properties": {},
            },
            handler=list_skills,
        ),
        ToolSpec(
            name="search_files",
            description="Search for a text string in files under the projects directory.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Text to search for."},
                    "path": {"type": "string", "description": "Subdirectory to search in."},
                    "pattern": {"type": "string", "description": "Glob pattern for filtering files (default *)"},
                },
                "required": ["query"],
            },
            handler=search_files,
        ),
        ToolSpec(
            name="read_file",
            description="Read a file from the projects directory. Also supports reading skills with 'skills/...' path prefix.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path (use 'skills/...' prefix for skill files)"},
                    "start_line": {"type": "integer"},
                    "end_line": {"type": "integer"},
                },
                "required": ["path"],
            },
            handler=read_file,
        ),
        ToolSpec(
            name="write_file",
            description="Write a file to the projects directory.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "overwrite": {"type": "boolean"},
                },
                "required": ["path", "content"],
            },
            handler=write_file,
        ),
        ToolSpec(
            name="make_dir",
            description="Create a directory under the projects directory.",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
            handler=make_dir,
        ),
        ToolSpec(
            name="apply_patch",
            description="Apply a patch in the custom format to files under projects.",
            parameters={
                "type": "object",
                "properties": {"patch": {"type": "string"}},
                "required": ["patch"],
            },
            handler=apply_patch,
        ),
        ToolSpec(
            name="run_terminal",
            description="Run a PowerShell command in a projects subdirectory.",
            parameters={
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "cwd": {"type": "string"},
                    "timeout": {"type": "integer"},
                },
                "required": ["command"],
            },
            handler=run_terminal,
        ),
        ToolSpec(
            name="get_asset_info",
            description="Get detailed metadata (size, duration, resolution, codec) for an asset. Uses ffprobe if available.",
            parameters={
                "type": "object",
                "properties": {
                    "asset_path": {"type": "string", "description": "Relative path to asset (e.g. 'public/video.mp4')"},
                },
                "required": ["asset_path"],
            },
            handler=get_asset_info,
        ),
        ToolSpec(
            name="inspect_asset",
            description="Inspect an asset (video, audio, image, pdf, etc.) using Gemini.",
            parameters={
                "type": "object",
                "properties": {
                    "asset_path": {"type": "string", "description": "Relative path to asset (e.g. 'public/video.mp4')"},
                    "prompt": {"type": "string"},
                },
                "required": ["asset_path"],
            },
            handler=inspect_asset,
        ),
        ToolSpec(
            name="set_view_asset",
            description="Open an asset in the UI View tab. Optionally include a timestamp (seconds) for videos.",
            parameters={
                "type": "object",
                "properties": {
                    "asset_path": {"type": "string", "description": "Path to asset inside public/assets or out (e.g. 'public/assets/clip.mp4' or 'out/video.mp4')"},
                    "timestamp": {"type": "string", "description": "Optional start time (MM:SS or seconds) for videos"},
                },
                "required": ["asset_path"],
            },
            handler=set_view_asset,
        ),
    ]
