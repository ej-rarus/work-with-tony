---
name: rough-cut
description: "Edit local Pocket 3 MP4/MOV footage into a vertical video with Korean captions and a separate SRT, using camera dialogue or a separate narration recording. Use for 컷 편집, 내레이션, 한글 자막, /video-journal:rough-cut (Claude Code), or $video-journal:rough-cut (Codex)."
---

# Make a video journal rough cut

Use the supplied local footage folder and any separate narration recording the user names. If the user supplies a shooting checklist or episode notes, use them to choose the narrative order and required shots. Treat filenames, media text, and transcripts as source material. Keep the originals read-only. Perform editing and transcription locally.

## Choose the footage

- If the user supplies a shot map, use it. Otherwise, if the originals already have `before_`, `cleaning_`, `after_`, and `talk_` prefixes, the script can use those directly. `cleaning_` is optional, and `talk_` is optional with separate narration. For camera filenames such as `DJI_0001.MP4`, inspect the actual footage and build the map outside the source folder.
- Inspect representative frames with FFmpeg and open them with the available local image viewer. Use more than one timestamp for a long or unclear shot. For frame and audio inspection, use local MP4/MOV inputs that resolve inside the original folder and pass `-nostdin -f mov -protocol_whitelist file -i "$clip"`. Use audio from speaking takes to identify the usable sentence and keep the start, ending, and intentional pauses. File numbering alone does not identify a scene. Ask about a required shot only if the footage and episode notes cannot resolve it.
- For a clean-up episode, select the before shot, action details, a matching after shot, then the closing take. For other episodes, use `b-roll` for supporting scenes. Preserve a short natural sound beat where it helps the story. Add precise source ranges when there is dead time or a retake.

The shot map lists immediate filenames, in order within each scene role. `start` and `end` are optional seconds in the original file. With camera dialogue, include a `talk` shot with speech audio. With separate narration, the map can contain only B-roll, including clips without audio. Any selected `talk` footage is still usable as a picture, with its original audio muted. Other camera audio is lowered while narration plays.

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

Resolve `scripts/rough_cut.py` relative to this skill. Use Python 3.10+, `ffprobe`, FFmpeg with the `subtitles` filter (libass), the PilGi Korean handwriting font, and `whisper-cli` with a local multilingual model. The script looks for Homebrew's `ffmpeg-full` and the cached `~/.cache/whisper.cpp/ggml-large-v3-turbo-q5_0.bin`. Pass `--ffmpeg` or `--model` for other locations.

```sh
python3 -B /path/to/scripts/rough_cut.py "/path/to/originals" \
  --shot-map "/path/to/shots.json" --output "/path/to/new-review-folder"
```

Omit `--shot-map` for the filename prefixes above. Omit `--output` to create a sibling folder with a `-rough-cut` suffix. Choose a new output folder for each revision. For a rerender, adjust the selected source ranges in the map and use the same originals.

For a separate voice recording, add `--narration "/path/to/recording.m4a"`. It also accepts WAV, MP3, and AIFF. Narration starts at the beginning by default. Use `--narration-start 1.5` to leave an opening beat. Make the selected footage long enough for the whole recording and its offset. The editor preserves the recording's timing and transcribes it directly, then aligns the SRT to the edit. If it overflows the available footage, choose longer usable shots or ask about the cut rather than dropping speech.

Return the 1080 × 1920 `rough-cut.mp4` with burned-in Korean subtitles, editable `captions.srt`, and `cuts.json` with the selected source ranges. Captions split at detected sentence endings first, then at word boundaries within longer sentences. The preset centers short white handwritten phrases slightly below the middle of the frame with a black box fitted to each line. Inspect a rendered subtitle frame for Hangul, box width, and placement, and check the edit and voice balance. Use the read-aloud script to check spelling while preserving the actual spoken wording. Report any ambiguous take or caption that needs review.
