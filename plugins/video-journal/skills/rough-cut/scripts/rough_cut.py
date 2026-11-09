#!/usr/bin/env python3
"""Turn selected episode footage into a vertical preview and timed Korean captions."""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

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


def parse_timestamp(value):
    hours, minutes, seconds, millis = map(int, re.split("[:,]", value))
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis


def timestamp(milliseconds):
    seconds, millis = divmod(milliseconds, 1000)
    minutes, second = divmod(seconds, 60)
    hours, minute = divmod(minutes, 60)
    return f"{hours:02}:{minute:02}:{second:02},{millis:03}"


def retime_captions(raw, output, talk_start, first_speech, timeline_end):
    cues = []
    timecode = r"\d{2,}:\d{2}:\d{2},\d{3}"
    for block in re.split(r"\n\s*\n", raw.read_text(encoding="utf-8-sig").strip()):
        lines = block.splitlines()
        if not lines:
            continue
        match = re.fullmatch(rf"({timecode}) --> ({timecode})", lines[1].strip()) if len(lines) >= 3 else None
        if not match or not lines[0].strip().isdigit():
            raise ValueError("Whisper produced a malformed SRT cue.")
        start = max(first_speech, talk_start + parse_timestamp(match[1]))
        end = min(timeline_end, talk_start + parse_timestamp(match[2]))
        if cues:
            start = max(start, cues[-1][1])
        caption = " ".join(" ".join(lines[2:]).split())
        if caption and end > start:
            cues.append((start, end, caption))
    if not cues:
        raise ValueError("No captionable speech was detected. Check the audio and ranges of the talk shots.")
    output.write_text(
        "".join(
            f"{index}\n{timestamp(start)} --> {timestamp(end)}\n{caption}\n\n"
            for index, (start, end, caption) in enumerate(cues, 1)
        ),
        encoding="utf-8",
    )


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

    ffprobe = shutil.which("ffprobe")
    whisper = shutil.which("whisper-cli")
    if not ffprobe or not whisper:
        raise ValueError("ffprobe and whisper-cli are required on PATH.")
    ffmpeg = ffmpeg_with_subtitles(args.ffmpeg)
    model = args.model.expanduser().resolve()
    if not model.is_file() or not model.stat().st_size or model.name.endswith(".en.bin"):
        raise ValueError(f"Provide a multilingual whisper.cpp model via --model. Checked {model}")

    cuts, warnings = plan_cuts(source, args.shot_map, ffprobe=ffprobe)
    position = 0
    talk_start = None
    edit_list = []
    for cut in cuts:
        next_position = position + cut_frames(cut["start"], cut["end"])
        if talk_start is None and cut["role"] == "talk" and cut["has_audio"]:
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
    if talk_start is None:
        raise ValueError("At least one talk shot needs an audio track for Korean captions.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".rough-cut-", dir=destination.parent) as scratch:
        scratch = Path(scratch)
        result = scratch / "result"
        result.mkdir()
        picture = scratch / "picture.mp4"
        dialogue = scratch / "dialogue.wav"
        captions = result / "captions.srt"
        preview = result / "rough-cut.mp4"

        render_timeline(cuts, picture, ffmpeg=ffmpeg)
        dialogue_result = run(
            [
                ffmpeg, "-nostdin", "-hide_banner", "-i", str(picture),
                "-af", f"atrim=start={talk_start / FRAME_RATE:.9f},"
                "asetpts=PTS-STARTPTS,silencedetect=noise=-45dB:d=0.25",
                "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dialogue),
            ],
            "Extracting dialogue from the cut",
        )
        run(
            [
                whisper, "-m", str(model), "-f", str(dialogue), "-l", "ko",
                "-osrt", "-ml", "34", "-sow", "-of", str(scratch / "speech"),
            ],
            "Transcribing Korean speech",
        )
        talk_ms = round(talk_start * 1000 / FRAME_RATE)
        first_speech = talk_ms
        leading_gap = re.search(r"silence_start: (\S+).*?silence_end: (\S+)", dialogue_result.stderr, re.S)
        if leading_gap and float(leading_gap[1]) < 0.03:
            first_speech += round(float(leading_gap[2]) * 1000)
        retime_captions(
            scratch / "speech.srt", captions, talk_ms, first_speech, round(position * 1000 / FRAME_RATE)
        )
        burn_captions(picture, captions, preview, ffmpeg=ffmpeg)
        run(
            [ffmpeg, "-nostdin", "-v", "error", "-xerror", "-i", str(preview), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
            "Decoding the finished preview",
        )
        (result / "cuts.json").write_text(
            json.dumps({"fps": FRAME_RATE, "duration_frames": position, "cuts": edit_list}, ensure_ascii=False, indent=2) + "\n",
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
