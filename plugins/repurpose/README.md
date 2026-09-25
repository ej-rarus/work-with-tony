# repurpose

Turn one piece of source material into a LinkedIn post and an Instagram carousel that make the same point in two different ways. Give it a topic, pasted notes, a retro, or a local Markdown or text file.

It does not publish, post, build, or export anything by itself. Drafting rules, publishing, and PNG export stay with the channel plugins, [linkedin-post](../linkedin-post/) and [instagram-carousel](../instagram-carousel/), including their confirmation steps.

## Install

Claude Code:

```text
/plugin marketplace add ej-rarus/work-with-tony
/plugin install repurpose@work-with-tony
/plugin install linkedin-post@work-with-tony
/plugin install instagram-carousel@work-with-tony
```

Codex:

```text
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add repurpose@work-with-tony
codex plugin add linkedin-post@work-with-tony
codex plugin add instagram-carousel@work-with-tony
```

The two channel plugins are optional. Without one, you still get a basic draft for that channel, but you cannot publish or export it from here. Start a new session or task after installing.

## Usage

```text
/repurpose:make ~/notes/retro.md
/repurpose:make 이번 주 PRD 표준 정하면서 배운 점
```

In Codex type `$repurpose:make` with the same arguments.

## How it works

1. **Core sheet.** It pulls out one claim, who it is for, 3–5 supports quoted from the source, one concrete example, anything that still needs checking (`확인 필요`), and a separate angle for each channel. Nothing is drafted until you confirm the sheet.
2. **Brief.** The confirmed sheet is saved to `~/.repurpose/briefs/<date>-<slug>.md` (override with `REPURPOSE_HOME`). That file is the only source both channels draft from, so no new facts slip in.
3. **Two drafts.** The LinkedIn draft comes from `linkedin-post`, with its style guide, structure rotation, and pre-publish check. The carousel plan comes from `instagram-carousel` in plan-only mode, with slides, caption, and alt text. A short match check then confirms both carry the same claim, no fact outside the brief, and different opening lines.
4. **Hand-off.** Say "올려" to publish the post, or ask to build the carousel to get the editable project and PNGs. Each channel asks for its own confirmation, and one approval never covers the other.

## Files it keeps

| Path | What |
|---|---|
| `~/.repurpose/briefs/` | Confirmed briefs, one Markdown file per piece. Never overwritten. |

The source file is never modified.

## Development

```text
npm test
claude plugin validate . --strict
```
