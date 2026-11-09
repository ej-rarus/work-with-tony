"""Render a local edit timeline and burn Korean subtitles with FFmpeg."""

from pathlib import Path
import shutil
import subprocess
import tempfile


FRAME_RATE = 30
SAMPLE_RATE = 48000
WIDTH = 1080
HEIGHT = 1920

VIDEO_ENCODING = (
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
)


def cut_frames(start: float, end: float) -> int:
    return max(1, round((end - start) * FRAME_RATE))


def _ffmpeg(ffmpeg: str, args: list[str], *, cwd: Path) -> None:
    result = subprocess.run(
        [ffmpeg, "-nostdin", "-hide_banner", "-v", "error", "-xerror", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        detail = result.stderr.strip() or f"exit code {result.returncode}"
        raise RuntimeError(f"FFmpeg could not render the video: {detail}")


def render_timeline(cuts: list[dict], output: Path, *, ffmpeg: str) -> None:
    """Render consecutive cuts with frame-aligned video and audio."""
    if not cuts:
        raise ValueError("The edit timeline is empty.")

    inputs = []
    filters = []
    labels = []
    for index, cut in enumerate(cuts):
        start, end = cut["start"], cut["end"]
        frames = cut_frames(start, end)
        samples = frames * (SAMPLE_RATE // FRAME_RATE)
        inputs.extend([
            "-threads", "2", "-f", "mov", "-protocol_whitelist", "file",
            "-ss", f"{start:.6f}", "-t", f"{frames / FRAME_RATE + 0.1:.6f}",
            "-i", str(Path(cut["path"]).resolve()),
        ])
        filters.append(
            f"[{index}:v:0]fps={FRAME_RATE}:start_time=0,"
            f"tpad=stop_mode=clone:stop=2,trim=end_frame={frames},"
            f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease:"
            f"force_divisible_by=2:reset_sar=1,"
            f"pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v{index}]"
        )
        if cut["has_audio"]:
            gain = 1 if cut["role"] == "talk" else 0.65
            audio = (
                f"[{index}:a:0]aresample={SAMPLE_RATE}:async=1:first_pts=0,"
                f"aformat=sample_fmts=fltp:channel_layouts=stereo,volume={gain},"
                f"apad=whole_len={samples}"
            )
        else:
            audio = f"anullsrc=r={SAMPLE_RATE}:cl=stereo"
        filters.append(f"{audio},atrim=end_sample={samples}[a{index}]")
        labels.append(f"[v{index}][a{index}]")
    filters.append(f"{''.join(labels)}concat=n={len(cuts)}:v=1:a=1[v][a]")

    with tempfile.TemporaryDirectory(prefix=".render-", dir=output.parent) as directory:
        work = Path(directory).resolve()
        rendered = work / "timeline.mp4"
        _ffmpeg(ffmpeg, [
            *inputs, "-filter_complex_threads", "2", "-filter_complex", ";".join(filters),
            "-map", "[v]", "-map", "[a]", "-map_metadata", "-1", "-map_chapters", "-1",
            *VIDEO_ENCODING, "-r", str(FRAME_RATE), "-c:a", "aac", "-b:a", "160k",
            str(rendered),
        ], cwd=work)
        rendered.replace(output)


def burn_captions(source: Path, captions: Path, output: Path, *, ffmpeg: str) -> None:
    """Burn UTF-8 SRT onto a rendered timeline, preserving its audio."""
    style = (
        f"PlayResX={WIDTH},PlayResY={HEIGHT},FontName=Apple SD Gothic Neo,"
        "FontSize=62,PrimaryColour=&H00FFFFFF,OutlineColour=&H20000000,"
        "BorderStyle=1,Outline=4,Shadow=1,Alignment=2,MarginL=90,MarginR=155,MarginV=335"
    )
    with tempfile.TemporaryDirectory(prefix=".captions-", dir=output.parent) as directory:
        work = Path(directory).resolve()
        rendered = work / "captioned.mp4"
        # Keep filesystem paths outside the filter expression.
        shutil.copyfile(captions, work / "captions.srt")
        _ffmpeg(ffmpeg, [
            "-f", "mov", "-protocol_whitelist", "file", "-i", str(source.resolve()),
            "-vf", f"subtitles=filename=captions.srt:force_style='{style}'",
            "-map", "0:v:0", "-map", "0:a:0", "-map_metadata", "-1", "-map_chapters", "-1",
            *VIDEO_ENCODING, "-c:a", "copy", str(rendered),
        ], cwd=work)
        rendered.replace(output)
