# video-journal

Find a filmable moment in a set of notes, then prepare an episode around the topic you pick. The same two skills run in Claude Code and Codex.

| Skill | Result |
|---|---|
| `find-topics` | Up to three candidates with a source note, working title, first shot, and a question to answer on camera. Existing episodes and ideas that need a future event are labeled. |
| `prepare-episode` | An episode folder and a copy of the working template with a shooting checklist and a separate read-aloud script. An existing episode can be resumed. |

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

## Use

```text
$video-journal:find-topics 소재함의 새 메모에서 후보를 뽑아줘.
$video-journal:find-topics 이번 메모에서 후보를 골라서 소재함에도 남겨줘.
$video-journal:prepare-episode "처음 걸어본 산책길"로 기록 02 준비해줘.
$video-journal:prepare-episode 기록 01의 촬영 준비 상태만 확인해줘.
```

Use `/video-journal:find-topics` and `/video-journal:prepare-episode` in Claude Code. The preparation skill follows the configured Drive location and checks the selected account before writing. Give it the same episode number to resume a partial run. For a preview, ask it to draft or check the episode first. Ask for PDFs when you need files to read on set. Filming, editing, and publishing are separate steps.

## Development

```sh
npm test
```
