# instagram-carousel

Plan an Instagram carousel in conversation, or build a private editable HTML project and export exact 1080×1350 PNG slides with a contact sheet. Two visual systems share seven layouts:

- **Tony Editorial Blue:** set the root field `"template": "editorial-blue"` for the approved photo-led blue, ivory, and white design.
- **Tony Digital Field Notes:** omit `template` to retain the existing typography-led system unchanged. There is no explicit legacy template value.

The plugin accepts a topic, pasted notes, an existing draft, or one explicit local UTF-8 Markdown/text file. Up to four local PNG, JPEG, or WebP images can be copied into a build. Images are optional. Only `editorial-blue` permits a cover image through the cover slide's `assetId`; the cover never automatically receives a character.

Instagram Carousel does not post to Instagram, send comment DMs, log in to social accounts, upload source files to another service, install a browser, or fetch stock imagery. All generation and export files are local.

## Requirements

- Claude Code or Codex with local file and shell access
- Node.js 20 or newer
- Chrome or Chromium only when PNG export is requested

There are no runtime package dependencies.

## Install

Claude Code:

```text
/plugin marketplace add ej-rarus/work-with-tony
/plugin install instagram-carousel@work-with-tony
```

Codex:

```text
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add instagram-carousel@work-with-tony
```

Start a new Claude Code session or Codex task after installation.

## Usage

Plan without creating files:

```text
/instagram-carousel:create MD 파일이 뭔지 PM 초보자용 7장 카드뉴스로 기획해줘. 파일은 만들지 마.
```

Build and export in Codex:

```text
$instagram-carousel:create 이 메모를 Tony Editorial Blue HTML 카드뉴스와 PNG로 만들어줘.
```

Editorial Blue keeps slide titles, body copy, brand/series metadata, and footer/page numbers as real DOM text rendered from `deck.json`. Its local photograph is a separate visual layer. Printed demonstration wording physically inside the photographed paper is part of that raster image, not editable HTML. The bundled Markdown photograph therefore suits Markdown content; choose or generate a topic-specific local photograph for a new subject instead of reusing its `.md` metaphor everywhere.

This HTML template is separate from the personal `artifact-template-tony-editorial-blue` image-generation skill. A flattened image produced with that skill is a visual reference or asset, not the editable carousel project.

The editable project contains `deck.json`, preview HTML, fixed CSS/JS, `caption.md`, `alt-text.md`, and `build-report.json`. `assets/` appears only when local images are supplied; `exports/` appears only after export.

`deck.json` is the supported content-editing surface, including a generated project's canonical deck with copied-asset metadata. Supply that file directly to `build` after editing; keep its copied assets in place. Build the revised deck into another new project directory. To change the reusable visual system, edit the plugin source `assets/carousel.css` and rebuild into a new directory. Manual changes to generated HTML, CSS, JavaScript, or copied assets invalidate the build report and are rejected by export; do not alter hashes to bypass this check.

## Editorial Blue example

Run from the plugin root. The bundled example references `examples/assets/md-paper-editorial.png` relative to that working directory:

```text
node scripts/carousel.mjs validate --deck examples/editorial-blue.deck.json --json
node scripts/carousel.mjs build --deck examples/editorial-blue.deck.json --out /absolute/existing-parent/tony-editorial-01 --json
node scripts/carousel.mjs export --project /absolute/existing-parent/tony-editorial-01 --json
```

Replace the output path with a new directory whose parent already exists. When moving the candidate example elsewhere, use an absolute local asset `path` or run from the working directory that resolves its relative path. Main layouts are `cover` (photo-led cover), `scene` (explanation), `compare` (source/result), `prompt` (practice), and `close` (next action); `checklist` and `statement` are also supported.

For a content revision, edit the generated `deck.json`, then use a different output directory:

```text
node scripts/carousel.mjs build --deck /absolute/existing-parent/tony-editorial-01/deck.json --out /absolute/existing-parent/tony-editorial-02 --json
node scripts/carousel.mjs export --project /absolute/existing-parent/tony-editorial-02 --json
```

## CLI

```text
node scripts/carousel.mjs inspect --file PATH [--json]
node scripts/carousel.mjs validate --deck PATH [--json]
node scripts/carousel.mjs build --deck PATH --out NEW_DIRECTORY [--json]
node scripts/carousel.mjs export --project PROJECT_DIRECTORY [--browser EXECUTABLE] [--json]
```

Exit status `0` means success, `1` means an input, validation, integrity, browser, or rendering failure, and `2` means invalid command usage. Build and export refuse existing output directories. Project directories are mode `0700`; generated files are mode `0600`.

Export verifies every build-report hash, asks the browser page for ready/missing/overflow status before each screenshot, checks every PNG's IHDR dimensions, and only then creates `exports/` atomically. The output includes ordered slide PNGs, `carousel-contact-sheet.png`, and `export-report.json`.

## Development

```text
npm test
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/create
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```
