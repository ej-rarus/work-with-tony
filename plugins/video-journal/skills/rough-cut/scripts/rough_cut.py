#!/usr/bin/env python3
"""Turn selected episode footage into a vertical preview and timed Korean captions."""

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from captions import write_captions
from narration import mix_narration, prepare_narration
from plan import plan_cuts
from render import FRAME_RATE, burn_captions, cut_frames, render_timeline


def ffmpeg_with_subtitles(explicit):
    candidates = [explicit] if explicit else [
        "ffmpeg-full",
        "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
        "/usr/local/opt/ffmpeg-full/bin/ffmpeg",
        "ffmpeg",
    ]
    for candidate in candidates:
        binary = shutil.which(candidate)
        if binary:
            filters = subprocess.run([binary, "-hide_banner", "-filters"], capture_output=True, text=True)
            if filters.returncode == 0 and re.search(r"^\s*\S+\s+subtitles\s", filters.stdout, re.M):
                return str(Path(binary).resolve())
    raise ValueError("FFmpeg with the subtitles (libass) filter is required. Pass its path with --ffmpeg.")


def run(command, action):
    result = subprocess.run(command, capture_output=True, text=True, errors="replace")
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"{action} failed: {detail[-3000:]}")
    return result


def make_rough_cut(args):
    source = args.input_dir.resolve(strict=True)
    destination = (args.output or source.with_name(f"{source.name}-rough-cut")).absolute()
    if destination.is_symlink():
        raise ValueError(f"Choose a new output directory: {destination}")
    destination = destination.resolve()
    if destination.is_relative_to(source):
        raise ValueError("The output directory must be outside the original footage directory.")
    if destination.exists():
        raise ValueError(f"Output already exists. Choose a new directory: {destination}")

    narration_start = args.narration_start if args.narration_start is not None else 0.0
    if args.narration_start is not None and args.narration is None:
        raise ValueError("--narration-start requires --narration.")
    if not math.isfinite(narration_start) or narration_start < 0:
        raise ValueError("--narration-start must be a finite, non-negative number of seconds.")

    ffprobe = shutil.which("ffprobe")
    whisper = shutil.which("whisper-cli")
    if not ffprobe or not whisper:
        raise ValueError("ffprobe and whisper-cli are required on PATH.")
    ffmpeg = ffmpeg_with_subtitles(args.ffmpeg)
    model = args.model.expanduser().resolve()
    if not model.is_file() or not model.stat().st_size or model.name.endswith(".en.bin"):
        raise ValueError(f"Provide a multilingual whisper.cpp model via --model. Checked {model}")

    has_narration = args.narration is not None
    cuts, warnings = plan_cuts(source, args.shot_map, ffprobe=ffprobe, has_narration=has_narration)
    position = 0
    talk_start = None
    edit_list = []
    for cut in cuts:
        next_position = position + cut_frames(cut["start"], cut["end"])
        if cut["role"] == "talk":
            if has_narration:
                cut["has_audio"] = False
            elif talk_start is None and cut["has_audio"]:
                talk_start = position
        edit_list.append({
            "file": Path(cut["path"]).name,
            "role": cut["role"],
            "source_start": cut["start"],
            "source_end": cut["end"],
            "timeline_start_frame": position,
            "timeline_end_frame": next_position,
        })
        position = next_position
    if not has_narration and talk_start is None:
        raise ValueError("At least one talk shot needs an audio track for Korean captions.")
    timeline_seconds = position / FRAME_RATE
    edit_metadata = {"fps": FRAME_RATE, "duration_frames": position, "cuts": edit_list}

    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".rough-cut-", dir=destination.parent) as scratch:
        scratch = Path(scratch)
        result = scratch / "result"
        result.mkdir()
        picture = scratch / "picture.mp4"
        dialogue = scratch / "dialogue.wav"
        captions = result / "captions.srt"
        preview = result / "rough-cut.mp4"

        if has_narration:
            narration = scratch / "narration.wav"
            duration = prepare_narration(args.narration.expanduser(), narration, ffmpeg=ffmpeg, ffprobe=ffprobe)
            speech_end = narration_start + duration
            if speech_end > timeline_seconds:
                raise ValueError(
                    f"Narration ends at {speech_end:.3f}s, but the edit is {timeline_seconds:.3f}s. "
                    "Select longer source ranges or start the narration earlier."
                )
            edit_metadata["narration"] = {
                "file": args.narration.name,
                "timeline_start_seconds": narration_start,
                "timeline_end_seconds": speech_end,
            }

        render_timeline(cuts, picture, ffmpeg=ffmpeg)
        if has_narration:
            mixed = scratch / "narrated.mp4"
            mix_narration(picture, narration, mixed, ffmpeg=ffmpeg, start=narration_start)
            picture = mixed
            speech_source, source_start, speech_offset = narration, 0.0, narration_start
        else:
            source_start = talk_start / FRAME_RATE
            speech_source, speech_offset, speech_end = picture, source_start, timeline_seconds

        dialogue_result = run(
            [
                ffmpeg, "-nostdin", "-hide_banner", "-i", str(speech_source),
                "-af", f"atrim=start={source_start:.9f},"
                "asetpts=PTS-STARTPTS,silencedetect=noise=-45dB:d=0.25",
                "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dialogue),
            ],
            "Extracting dialogue from the cut",
        )
        run(
            [
                whisper, "-m", str(model), "-f", str(dialogue), "-l", "ko",
                "-osrt", "-ml", "1", "-sow", "-of", str(scratch / "speech"),
            ],
            "Transcribing Korean speech",
        )
        offset_ms = round(speech_offset * 1000)
        first_speech = offset_ms
        leading_gap = re.search(r"silence_start: (\S+).*?silence_end: (\S+)", dialogue_result.stderr, re.S)
        if leading_gap and float(leading_gap[1]) < 0.03:
            first_speech += round(float(leading_gap[2]) * 1000)
        write_captions(
            scratch / "speech.srt", captions,
            speech_offset=offset_ms, first_speech=first_speech, speech_end=round(speech_end * 1000),
        )
        burn_captions(picture, captions, preview, ffmpeg=ffmpeg)
        run(
            [ffmpeg, "-nostdin", "-v", "error", "-xerror", "-i", str(preview), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
            "Decoding the finished preview",
        )
        (result / "cuts.json").write_text(
            json.dumps(edit_metadata, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if destination.exists() or destination.is_symlink():
            raise ValueError(f"Output already exists. Choose a new directory: {destination}")
        result.rename(destination)

    for warning in warnings:
        print(f"Note: {warning}", file=sys.stderr)
    print(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_dir", type=Path, help="Local folder containing Pocket 3 MP4/MOV clips")
    parser.add_argument("--shot-map", type=Path, help="JSON with the selected shots, roles and optional source ranges")
    parser.add_argument("--narration", type=Path, help="Separate WAV, M4A, MP3, or AIFF narration recording")
    parser.add_argument("--narration-start", type=float, help="Narration start on the finished timeline, in seconds (default: 0)")
    parser.add_argument("--output", type=Path, help="New directory for the MP4, SRT, and edit list")
    parser.add_argument("--ffmpeg", help="FFmpeg binary with the libass subtitles filter")
    parser.add_argument("--model", type=Path, default=os.environ.get(
        "VIDEO_JOURNAL_WHISPER_MODEL", str(Path.home() / ".cache/whisper.cpp/ggml-large-v3-turbo-q5_0.bin")
    ), help="Local multilingual whisper.cpp model")
    try:
        make_rough_cut(parser.parse_args())
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, f"rough-cut: {error}\n")


if __name__ == "__main__":
    main()
