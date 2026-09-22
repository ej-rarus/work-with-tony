---
name: check
description: Check a Markdown PRD against the team's PRD template and rule file, write a line-numbered report of errors and review items next to the PRD, and summarize what to fix first. Use when the user types /prd-check:check (Claude Code) or $prd-check:check (Codex), asks to check, review, or validate a PRD against the standard, or asks whether a PRD follows the template.
---

# PRD Check

The script finds every structural violation; you add the judgment items. Never edit the PRD. Never send the PRD or the report anywhere.

Run scripts from this plugin's root. In Claude Code `CLAUDE_PLUGIN_ROOT` points there:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" "<prd.md>" --template "<template.md>" [--rules "<rules.json>"] --json
```

If `CLAUDE_PLUGIN_ROOT` is unset (Codex), the plugin root is two directories above the base directory announced when this skill loaded (`.../skills/check` → `...`).

## Settings

`PRD_CHECK_HOME` env var if set, otherwise `~/.prd-check/`. It holds `config.json`:

```json
{ "template": "/absolute/path/to/prd-template.md", "rules": "/absolute/path/to/rules.json" }
```

`rules` is optional; without it the built-in `references/default-rules.json` applies. A team rules file only needs the keys it changes.

## 1. Resolve inputs

1. Parse the invocation: `/prd-check:check <prd.md> [--template <path>] [--rules <path>]`. No PRD path → ask once: "어떤 PRD를 검사할까요? 파일 경로를 주세요."
2. Template: `--template` flag, else `config.json`, else ask once for the template path and save `config.json` (create the directory). Same for rules, but rules may stay empty.
3. Do not read the template or rules yourself for checking; the script does.

## 2. Run the script

Run the command above with `--json`. Parse the single JSON line.

- `ok:false` → show `code`, `message`, `hint` in plain language and stop. Common: `TEMPLATE_NOT_FOUND` (fix the path in config.json), `RULES_INVALID` (the named key is wrong), `NO_HEADINGS` (not a Markdown PRD).
- `ok:true` → note `report` (path of the written report), `summary`, `findings`, `structure`.

## 3. Add review items

Read `references/review-guide.md` and apply its four rules — `review.criteria`, `review.scope`, `review.asserted`, `review.openItems` — to the `structure` block. Use only the line numbers the script provided; for `review.asserted` you may read the PRD sections the guide names to find the asserting sentence's line.

Append your rows to the report file directly under the `<!-- skill-review -->` marker, in the same four-column table format as the `## 확인` table (`| 줄 | 규칙 | 내용 | 판단 근거 |`). If the `## 확인` table said `없음` and you add rows, replace `없음` with a table header first. Keep the marker at the end.

## 4. Reply

One short message:
- `오류 N · 확인 M` (M includes your items), the report path.
- The three findings to fix first: errors before reviews, structure and table errors before cell errors, lowest line first within a group.
- One sentence if the PRD is clean.

Cite by line and rule. Quote at most one short phrase from the PRD per finding.

## Rules

- Never edit the PRD. The only file you write is the report (and `config.json` on first run).
- Never paste the whole PRD or report into the conversation.
- Never invent line numbers.
- If the script reports more than 50 errors, say the PRD does not follow the template's structure yet and list the structure/table errors only; cell-level errors will be noise until the structure matches.
