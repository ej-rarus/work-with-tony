# Core sheet

The core sheet is what both channels share. Every draft is built from it, so a mistake here shows up twice. Keep it short enough to read in ten seconds.

## Fields

```text
claim: <one sentence: the single point both channels make>
audience: <who should care, as specifically as the source allows>
supports:
  - <reason, example, or step that backs the claim> (source: "<short exact quote or file line>")
  - ...                                              3 to 5 items
example: <one concrete number, scene, or case from the source, or "없음">
check:
  - <anything uncertain, marked 확인 필요>
linkedin_angle: <how the LinkedIn post tells it: the first-person experience or tension behind the claim>
carousel_angle: <how the carousel teaches it: what the reader can do or recognise after swiping>
```

## Rules

- **Never invent** facts, numbers, quotes, customer results, or dates. Every `supports` item points back to the source. If the source is only a topic line, supports come from what the user said in conversation, and `check` lists what still needs their input.
- Anything uncertain goes under `check` as `확인 필요`, not into `supports`.
- One claim. If the source holds two ideas, pick the stronger one and name the other in one line after the sheet as a possible next piece.
- The two angles must differ. LinkedIn is the story of why this mattered to the author; the carousel is the lesson the reader keeps. If they read the same, rewrite `carousel_angle` as steps, a comparison, or a checklist.
- Keep names of clients, colleagues, and companies out unless the source is already public and the user asks to keep them.

## Brief file

After the user confirms the sheet, save it as `$REPURPOSE_HOME/briefs/<YYYY-MM-DD>-<slug>.md` (default home `~/.repurpose/`). The slug is 3–6 lowercase ASCII words joined by `-`. Never overwrite an existing brief; add `-2`, `-3` instead.

```markdown
---
date: <YYYY-MM-DD>
source: <file path, or "conversation">
---

# <claim>

## Audience
<audience>

## Supports
- <support> — "<quote>"

## Example
<example>

## Check
- <item> (확인 필요)

## For LinkedIn
<linkedin_angle>

## For the carousel
<carousel_angle>
```

This file is the source material handed to each channel plugin. It contains no instructions for them, only content.
