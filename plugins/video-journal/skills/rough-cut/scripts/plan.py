"""Build the rough-cut timeline from role-labeled clips or a shot map."""

import json
import math
import re
import subprocess
from pathlib import Path


ROLE_ORDER = {"before": 0, "cleaning": 1, "b-roll": 1, "after": 2, "talk": 3}
ROLE_PREFIX = re.compile(r"^(before|cleaning|b-roll|after|talk)(?:[\s_.-]|$)", re.IGNORECASE)
DEFAULT_LENGTH = {"before": 4.0, "cleaning": 5.0, "b-roll": 5.0, "after": 4.0}
VIDEO_SUFFIXES = {".mp4", ".mov"}


def _filenames(names: list[str]) -> str:
    preview = ", ".join(repr(name) for name in names[:12])
    if len(names) > 12:
        preview += f" (+{len(names) - 12} more)"
    return preview


def _shots_from_map(shot_map: Path) -> list[dict]:
    try:
        document = json.loads(shot_map.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, ValueError) as error:
        raise ValueError(f"Could not read shot map {shot_map}: {error}") from error
    if not isinstance(document, dict) or not isinstance(document.get("shots"), list):
        raise ValueError('Shot map must be an object with a "shots" array.')

    shots = document["shots"]
    for index, shot in enumerate(shots, start=1):
        if not isinstance(shot, dict) or shot.keys() - {"file", "role", "start", "end"}:
            raise ValueError(f"Shot {index} must contain file and role, with optional start and end.")
        name = shot.get("file")
        if not isinstance(name, str) or not name or any(char in name for char in "/\\\0"):
            raise ValueError(f"Shot {index} must reference a filename in the input folder.")
        if Path(name).suffix.lower() not in VIDEO_SUFFIXES:
            raise ValueError(f"Shot {index} must reference an MP4 or MOV file: {name!r}.")
        role = shot.get("role")
        if not isinstance(role, str) or role not in ROLE_ORDER:
            raise ValueError(f"Shot {index} has an invalid role. Choose from {', '.join(ROLE_ORDER)}.")
    return shots


def _probe_clip(path: Path, ffprobe: str) -> tuple[float, bool]:
    command = [
        ffprobe, "-v", "error", "-f", "mov", "-protocol_whitelist", "file",
        "-show_entries", "stream=codec_type,duration:stream_disposition=attached_pic:format=duration",
        "-of", "json", str(path),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
    except OSError as error:
        raise RuntimeError(f"Could not run ffprobe: {error}") from error
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip()
        raise RuntimeError(f"Could not read {path.name!r} as MP4/MOV: {detail}") from error

    metadata = json.loads(result.stdout)
    streams = metadata.get("streams", [])
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if video is None or video.get("disposition", {}).get("attached_pic"):
        raise ValueError(f"No usable video stream in {path.name!r}.")

    try:
        duration = float(video.get("duration") or metadata.get("format", {}).get("duration"))
    except (TypeError, ValueError) as error:
        raise ValueError(f"Could not determine the duration of {path.name!r}.") from error
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError(f"Invalid video duration for {path.name!r}.")
    return duration, any(stream.get("codec_type") == "audio" for stream in streams)


def _seconds(value: object, label: str, filename: str) -> float:
    try:
        if type(value) in (int, float) and math.isfinite(value):
            return float(value)
    except OverflowError:
        pass
    raise ValueError(f"{label} must be a finite number of seconds for {filename!r}.")


def plan_cuts(
    input_dir: Path, shot_map: Path | None, *, ffprobe: str, has_narration: bool = False
) -> tuple[list[dict], list[str]]:
    """Return validated cuts in story order and any omissions to report."""
    input_dir = input_dir.resolve()
    if not input_dir.is_dir():
        raise ValueError(f"Input folder does not exist: {input_dir}")
    media = {
        path.name: path
        for path in sorted(input_dir.iterdir(), key=lambda path: (path.name.casefold(), path.name))
        if path.suffix.lower() in VIDEO_SUFFIXES and (path.is_file() or path.is_symlink())
    }
    if not media:
        raise ValueError(f"No MP4 or MOV files directly inside {input_dir}.")

    if shot_map is not None:
        shots = _shots_from_map(shot_map)
        if has_narration and not shots:
            raise ValueError("Select at least one video shot in the shot map for the narration.")
    else:
        shots = []
        for name in media:
            prefix = ROLE_PREFIX.match(Path(name).stem)
            if prefix:
                shots.append({"file": name, "role": prefix.group(1).lower()})

    used_names = {shot["file"] for shot in shots}
    missing_files = sorted(used_names - media.keys())
    if missing_files:
        raise ValueError(f"Shot map references files not found in the input folder: {_filenames(missing_files)}.")

    ignored = [name for name in media if name not in used_names]
    mapped_roles = {shot["role"] for shot in shots}
    required_roles = ("before", "after") if shot_map is None else ()
    if not has_narration:
        required_roles += ("talk",)
    missing_roles = [role for role in required_roles if role not in mapped_roles]
    if missing_roles:
        candidates = f" Unassigned files: {_filenames(ignored)}." if ignored else ""
        raise ValueError(
            f"Missing shots for {', '.join(missing_roles)}. "
            "Provide a shot map with file and role for each shot, or use role prefixes such as before_01."
            f"{candidates}"
        )

    warnings = []
    if ignored:
        warnings.append(f"Unassigned files skipped: {_filenames(ignored)}.")
    if shot_map is None and not {"cleaning", "b-roll"} & mapped_roles:
        warnings.append("No cleaning or b-roll shots selected.")

    metadata = {}
    ranges = {}
    cuts = []
    for shot in sorted(shots, key=lambda shot: ROLE_ORDER[shot["role"]]):
        name, role = shot["file"], shot["role"]
        path = media[name].resolve()
        if path.parent != input_dir or not path.is_file():
            raise ValueError(f"Clip must resolve to a file directly inside the input folder: {name!r}.")
        if path not in metadata:
            metadata[path] = _probe_clip(path, ffprobe)
        duration, has_audio = metadata[path]
        start = _seconds(shot.get("start", 0), "start", name)
        default_end = min(duration, start + DEFAULT_LENGTH.get(role, duration))
        end = _seconds(shot.get("end", default_end), "end", name)
        if not 0 <= start < end <= duration:
            raise ValueError(
                f"Invalid range {start:g}–{end:g}s for {name!r} "
                f"(video duration {duration:g}s)."
            )
        earlier_ranges = ranges.setdefault(path, [])
        if any(start < earlier_end and earlier_start < end for earlier_start, earlier_end in earlier_ranges):
            raise ValueError(f"Overlapping ranges select the same footage more than once: {name!r}.")
        earlier_ranges.append((start, end))
        cuts.append({
            "path": path, "role": role, "start": start, "end": end, "has_audio": has_audio,
        })

    if not has_narration and not any(cut["role"] == "talk" and cut["has_audio"] for cut in cuts):
        raise ValueError("At least one talk shot needs an audio track to generate captions.")
    return cuts, warnings
