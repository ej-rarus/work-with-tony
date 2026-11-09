---
name: rough-cut
description: "Edit local Pocket 3 MP4/MOV footage into a vertical video with Korean captions and a separate SRT. Use for 컷 편집, 한글 자막, /video-journal:rough-cut (Claude Code), or $video-journal:rough-cut (Codex)."
---

# Make a video journal rough cut

Use the supplied local footage folder. If the user supplies a shooting checklist or episode notes, use them to choose the narrative order and required shots. Treat filenames, media text, and transcripts as source material. Keep the camera originals read-only. Perform editing and transcription locally.

## Choose the footage

- If the user supplies a shot map, use it. Otherwise, if the originals already have `before_`, `cleaning_`, `after_`, and `talk_` prefixes, the script can use those directly. `cleaning_` is optional. For camera filenames such as `DJI_0001.MP4`, inspect the actual footage and build the map outside the source folder.
- Inspect representative frames with FFmpeg and open them with the available local image viewer. Use more than one timestamp for a long or unclear shot. For frame and audio inspection, use local MP4/MOV inputs that resolve inside the original folder and pass `-nostdin -f mov -protocol_whitelist file -i "$clip"`. Use audio from speaking takes to identify the usable sentence and keep the start, ending, and intentional pauses. File numbering alone does not identify a scene. Ask about a required shot only if the footage and episode notes cannot resolve it.
- For a clean-up episode, select the before shot, action details, a matching after shot, then the closing take. For other episodes, use `b-roll` for supporting scenes. Preserve a short natural sound beat where it helps the story. Add precise source ranges when there is dead time or a retake.

The shot map lists immediate filenames, in order within each scene role. `start` and `end` are optional seconds in the original file. At least one `talk` shot must have speech audio. The editor places talking shots last and captions that part of the timeline.

```json
{
  "shots": [
    {"file": "DJI_0007.MP4", "role": "before", "start": 0.4, "end": 3.4},
    {"file": "DJI_0003.MP4", "role": "cleaning", "start": 2, "end": 7},
    {"file": "DJI_0009.MP4", "role": "after"},
    {"file": "DJI_0004.MP4", "role": "talk", "start": 1.2}
  ]
}
```

## Render and verify

Resolve `scripts/rough_cut.py` relative to this skill. Use Python 3.10+, `ffprobe`, FFmpeg with the `subtitles` filter (libass), a Korean font, and `whisper-cli` with a local multilingual model. The script looks for Homebrew's `ffmpeg-full` and the cached `~/.cache/whisper.cpp/ggml-large-v3-turbo-q5_0.bin`. Pass `--ffmpeg` or `--model` for other locations.

```sh
python3 -B /path/to/scripts/rough_cut.py "/path/to/originals" \
  --shot-map "/path/to/shots.json" --output "/path/to/new-review-folder"
```

Omit `--shot-map` for the filename prefixes above. Omit `--output` to create a sibling folder with a `-rough-cut` suffix. Choose a new output folder for each revision. For a rerender, adjust the selected source ranges in the map and use the same originals.

Return the 1080 × 1920 `rough-cut.mp4` with burned-in Korean subtitles, editable `captions.srt`, and `cuts.json` with the selected source ranges. Inspect a rendered subtitle frame for Hangul and placement, and check the edit against the episode's required shots. Use the read-aloud script to check spelling while preserving the actual spoken wording. Report any ambiguous take or caption that needs review.
