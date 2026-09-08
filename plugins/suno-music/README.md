# suno-music

Prepare Suno's Advanced creation form from lyrics and a style prompt that you approved in conversation. The plugin uses your existing logged-in Suno browser session, verifies every populated value, and leaves the completed form open for review.

This plugin works in Claude Code and the Codex app when the host has browser-control access to your existing signed-in Suno session. It does not require a Suno API key or a separate browser profile.

## Install

Claude Code:

```text
/plugin marketplace add ej-rarus/work-with-tony
/plugin install suno-music@work-with-tony
```

Codex:

```text
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add suno-music@work-with-tony
```

Start a new Claude Code session or Codex task after installation so the skill is loaded.

## Usage

Invoke the skill directly in Claude Code:

```text
/suno-music:prepare 제목: 다시 송신 / 가사: ... / 스타일: ...
```

Or in Codex:

```text
$suno-music:prepare 제목: 다시 송신 / 가사: ... / 스타일: ...
```

Natural language works too:

```text
확정한 제목, 가사, 스타일을 Suno에 입력해줘.
```

`lyrics` and `style` are required. `title`, `vocalGender`, `model`, and `excludeStyles` are optional. Lyrics are limited to 5,000 characters and style prompts to 1,000 characters, matching the current Suno Advanced form.

The skill preserves the supplied text exactly unless you ask it to edit. If the existing Suno form already contains values, it asks before replacing them.

## Safety boundary

This plugin does not click `Create song`, spend credits, or download audio. It also does not automate login, CAPTCHA, subscriptions, credit purchases, uploads, publishing, or distribution.

## Troubleshooting

- **Login required:** Sign in on the Suno tab, then invoke the skill again.
- **Browser control unavailable:** Enable a compatible browser-control integration in the host, then invoke the skill again.
- **Form already occupied:** Confirm replacement only if the current draft is safe to overwrite.
- **Field labels changed:** The skill stops instead of guessing with screen coordinates. Update the plugin after checking the current Suno UI.
- **Requested model unavailable:** The current model remains unchanged and the skill reports the unavailable selection.

## Development

```text
npm test
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```
