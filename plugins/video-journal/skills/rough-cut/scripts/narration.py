"""Decode a local narration recording and lay it over the rendered timeline."""

import math
import subprocess
import wave
from pathlib import Path

from render import SAMPLE_RATE


RECORDING_FORMATS = {
    ".m4a": "mov",
    ".wav": "wav",
    ".mp3": "mp3",
    ".aif": "aiff",
    ".aiff": "aiff",
    ".aifc": "aiff",
}


def _run(command: list[str], action: str) -> str:
    result = subprocess.run(command, capture_output=True, text=True, errors="replace")
    if result.returncode:
        detail = result.stderr.strip() or f"exit code {result.returncode}"
        raise RuntimeError(f"{action} failed: {detail[-3000:]}")
    return result.stdout


def _narration_samples(path: Path) -> int:
    try:
        with wave.open(str(path), "rb") as recording:
            if recording.getframerate() != SAMPLE_RATE or recording.getnchannels() != 1:
                raise ValueError("Narration audio must be prepared as a 48 kHz mono WAV.")
            samples = recording.getnframes()
    except (wave.Error, EOFError) as error:
        raise ValueError("The prepared narration is not a valid PCM WAV.") from error
    if not samples:
        raise ValueError("The narration recording contains no audio samples.")
    return samples


def prepare_narration(source: Path, output: Path, *, ffmpeg: str, ffprobe: str) -> float:
    """Decode the recording without trimming and return its duration in seconds."""
    source = source.expanduser().absolute()
    demuxer = RECORDING_FORMATS.get(source.suffix.lower())
    if demuxer is None:
        raise ValueError("Choose a narration recording in M4A, WAV, MP3, or AIFF format.")
    if not source.is_file() or source.stat().st_size == 0:
        raise ValueError(f"Choose a nonempty local narration file: {source}")
    source = source.resolve()
    input_options = ["-f", demuxer, "-protocol_whitelist", "file"]
    stream = _run(
        [ffprobe, "-v", "error", *input_options, "-select_streams", "a:0",
         "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(source)],
        "Checking the narration recording",
    )
    if stream.strip() != "audio":
        raise ValueError(f"The narration recording has no audio stream: {source}")
    _run(
        [ffmpeg, "-nostdin", "-hide_banner", "-v", "error", "-xerror", "-n",
         *input_options, "-i", str(source), "-map", "0:a:0", "-map_metadata", "-1",
         "-ar", str(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", "-f", "wav", str(output.resolve())],
        "Decoding the narration recording",
    )
    return _narration_samples(output) / SAMPLE_RATE


def mix_narration(picture: Path, narration: Path, output: Path, *, ffmpeg: str, start: float) -> None:
    """Keep camera audio outside the narration and duck it beneath the voice."""
    if not math.isfinite(start) or start < 0:
        raise ValueError("The narration start must be a finite, nonnegative number of seconds.")
    offset = round(start * SAMPLE_RATE)
    start = offset / SAMPLE_RATE
    end = start + _narration_samples(narration) / SAMPLE_RATE
    # Fade into the ducked level just before narration, then restore camera sound after it.
    duck = f"clip(min((t-{start:.9f}+0.12)/0.12,({end:.9f}+0.18-t)/0.18),0,1)"
    audio_filter = (
        f"[0:a:0]asetpts=PTS-STARTPTS,volume='1-0.88*{duck}':eval=frame[camera];"
        f"[1:a:0]asetpts=PTS-STARTPTS,pan=stereo|c0=0.85*c0|c1=0.85*c0,adelay={offset}S:all=1[voice];"
        "[camera][voice]amix=inputs=2:duration=first:normalize=0[mixed]"
    )
    _run(
        [ffmpeg, "-nostdin", "-hide_banner", "-v", "error", "-xerror", "-n",
         "-f", "mov", "-protocol_whitelist", "file", "-i", str(picture.resolve()),
         "-f", "wav", "-protocol_whitelist", "file", "-i", str(narration.resolve()),
         "-filter_complex", audio_filter, "-map", "0:v:0", "-map", "[mixed]", "-c:v", "copy",
         "-c:a", "aac", "-b:a", "160k", "-map_metadata", "-1", "-map_chapters", "-1",
         "-movflags", "+faststart", str(output.resolve())],
        "Mixing narration over the picture",
    )
