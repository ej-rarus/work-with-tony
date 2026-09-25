# explain-this

Learn IT concepts from the actual contents of a local Markdown, HTML, or JSON file. The plugin first explains exact passages in plain language. When you ask for an exercise, it can create a private offline lesson with a small reconstructed example and side-by-side before/after previews.

The source file stays unchanged. Explain This does not execute source content, fetch referenced links, upload files through an additional API or service, or attempt to faithfully render arbitrary HTML or CSS. The generated lesson is offline; this does not assert that the Claude or Codex host itself runs locally.

JSON practice uses JavaScript parsing and numeric precision. Overflowing numbers are rejected; exact large-integer or decimal arithmetic is outside this learning preview's scope.

## Requirements

- Claude Code or Codex with local file and shell access
- Node.js 20 or newer
- A UTF-8 regular `.md`, `.html`, or `.json` file no larger than 131,072 bytes

There are no runtime package dependencies.

## Install

Claude Code:

```text
/plugin marketplace add ej-rarus/work-with-tony
/plugin install explain-this@work-with-tony
```

Codex:

```text
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add explain-this@work-with-tony
```

Start a new Claude Code session or Codex task after installation so the skill is loaded.

## Usage

Explain a file without creating anything:

```text
/explain-this:explain /absolute/path/to/notes.md 파일 내용만 쉽게 설명해줘. 파일은 만들지 마.
```

In Codex, use the `$` invocation:

```text
$explain-this:explain /absolute/path/to/config.json 을 설명하고 연습 화면도 만들어줘.
```

Natural-language requests work too. The skill treats all file content as untrusted data and grounds its explanation in verified, exact passages. The optional lesson is explicitly a reconstructed learning example, not the original file or a faithful rendering of it.

When a lesson is requested, the build creates a new mode-`0700` output directory containing `index.html` and `lesson.json` as mode-`0600` files. It never overwrites an existing path and does not copy the source file. The generated page runs locally without an account, server, upload, persistence, or network access. Edits live only in the current page; reset or reload restores the initial exercise, and v0.1 has no export or download action.

## CLI

All paths are explicit:

```text
node scripts/explain.mjs inspect --file PATH [--json]
node scripts/explain.mjs build --file PATH --lesson PATH --out NEW_DIRECTORY [--json]
```

Exit status `0` means success, `1` means an input or validation failure, and `2` means the command usage is invalid. `build` verifies the current source hash and every quoted passage before writing.

## Troubleshooting

- **Unsupported source:** Use a UTF-8 regular `.md`, `.html`, or `.json` file within the size limit. Symlinks, binary NUL, invalid UTF-8, and other extensions are rejected.
- **Source changed:** Inspect the file again and regenerate the candidate lesson. A stale `sourceHash` is rejected.
- **Quote rejected:** Use a nonempty, exact source substring. Add a one-based `occurrence` when the same passage appears more than once.
- **Output already exists:** Choose a new directory. Existing files, directories, and symlinks are never replaced.
- **Usage error:** Run one of the two CLI forms above with every required flag exactly once.

## Development

```text
npm test
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/explain
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

The optional browser regressions use an existing Playwright installation and Chromium; they are skipped when these paths are unset. No browser dependency is bundled with the plugin:

```sh
EXPLAIN_TEST_PLAYWRIGHT=/absolute/path/to/playwright/index.js \
EXPLAIN_TEST_CHROMIUM=/absolute/path/to/chromium \
npm test
```
