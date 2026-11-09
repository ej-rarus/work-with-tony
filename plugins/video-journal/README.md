# video-journal

Find a filmable moment in your notes, prepare the episode, edit the footage, and draft the text that goes with it. The skills run in Claude Code and Codex.

| Skill | Result |
|---|---|
| `find-topics` | Up to three candidates with a source note, working title, first shot, and a question to answer on camera. Existing episodes and ideas that need a future event are labeled. |
| `prepare-episode` | An episode folder and a copy of the working template with a shooting checklist and a separate read-aloud script. An existing episode can be resumed. |
| [`rough-cut`](skills/rough-cut/SKILL.md) | A vertical MP4 with Korean subtitles from camera speech or a separate narration recording, plus a separate SRT and the source ranges used in the cut. |
| [`prepare-publish`](skills/prepare-publish/SKILL.md) | An Instagram Reel caption and a YouTube Shorts title and description based on the chosen MP4 and SRT. |

## Install

Claude Code:

```text
/plugin marketplace add ej-rarus/work-with-tony
/plugin install video-journal@work-with-tony
```

Codex:

```text
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add video-journal@work-with-tony
```

Open a new session or task after installation. Node.js 20+ runs the config helper without extra dependencies. Connect Google Drive and Google Docs in your host to read or update a channel's Drive materials. You can still draft from supplied notes in chat.

## Connect a channel

Copy [config.example.json](config.example.json) to `~/.config/work-with-tony/video-journal.json`, or keep a separate private file and explicitly name its path when invoking the skill. Replace the example values:

- `channelName` is the channel's display name and the prefix of its episode folders.
- `driveAccountEmail` identifies the Google account to verify for Drive operations.
- `channelFolderUrl` is the channel's parent folder in Drive.
- `topicInboxUrl` is the Google Doc where you collect topic notes.
- `episodeTemplateUrl` is the Google Doc to copy for a new episode.

An explicit config path in the request takes precedence, followed by `VIDEO_JOURNAL_CONFIG` and the home config. A file from the working directory is used only when explicitly selected. Keep channel configs in a private location outside published repositories. The config contains no credentials. It identifies the intended account, and the host's Drive connection supplies authentication.

For consistent publishing copy, keep an optional Markdown voice profile next to your selected config. For `video-journal.json`, name it `video-journal.voice.md`. Put the channel name, a few tone notes, and examples from your own speech or writing in it. You can also supply a profile path in the request.

## Use

```text
$video-journal:find-topics 소재함의 새 메모에서 후보를 뽑아줘.
$video-journal:find-topics 이번 메모에서 후보를 골라서 소재함에도 남겨줘.
$video-journal:prepare-episode "처음 걸어본 산책길"로 기록 02 준비해줘.
$video-journal:prepare-episode 기록 01의 촬영 준비 상태만 확인해줘.
$video-journal:rough-cut "/path/to/Pocket 3 originals"로 기록 01 편집 초안과 한글 자막 만들어줘.
$video-journal:rough-cut "/path/to/Pocket 3 originals"에 "/path/to/내레이션.m4a"를 얹고 한글 자막 만들어줘.
$video-journal:prepare-publish "/path/to/편집 v1"의 MP4와 SRT로 릴스 본문과 쇼츠 제목·설명 초안 만들어줘.
```

Use the same skill names with `/video-journal:` in Claude Code. The episode preparation skill follows the configured Drive location and checks the selected account before writing. Give it the same episode number to resume a partial run. For a preview, ask it to draft or check the episode first. Ask for PDFs when you need files to read on set.

Rough cuts run locally with Python 3.10+, FFmpeg with libass, `ffprobe`, the PilGi Korean handwriting font, and `whisper-cli` with a multilingual model. The footage folder can use camera filenames. The skill inspects the clips and records the chosen roles and ranges in a shot map. Add the episode's checklist when it is available. A separate M4A, WAV, MP3, or AIFF recording can be added with `--narration`. The video uses short white handwritten captions with a fitted black background just below the middle of the screen. The three outputs go into a new folder beside the originals by default.

For publishing drafts, give the selected rough-cut folder or name its MP4 and matching SRT. The skill checks the cut, reads the captions, and reviews the Instagram opening line on its own. It returns the three drafts in chat. Give it a local path if you want a copy saved.

## Development

```sh
npm test
```
