# prd-check

Check a Markdown PRD against your team's PRD template and a small rule file. The result is `<prd>.check.md` next to the PRD: every finding has a line number, a rule id, and a one-line fix. The PRD itself is never modified.

## Install

Claude Code:

```
/plugin marketplace add ej-rarus/work-with-tony
/plugin install prd-check@work-with-tony
```

Codex:

```
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add prd-check@work-with-tony
```

## Setup

The plugin ships no template. Point it at yours once:

```json
// ~/.prd-check/config.json
{ "template": "/path/to/your/prd-template.md", "rules": "/path/to/your/rules.json" }
```

`rules.json` overrides keys of `skills/check/references/default-rules.json` (status values, priority values, ID pattern, placeholder pattern, weak completion-criteria phrases, which section holds open items, and table signatures that do not belong in a PRD). Omit it to use the defaults.

## Usage

```
/prd-check:check ~/docs/shop-prd.md
/prd-check:check ~/docs/shop-prd.md --template ~/standards/prd-template.md --rules ~/standards/prd-rules.json
```

Codex: `$prd-check:check ...` with the same arguments.

The script reports **errors** (missing or reordered sections, table headers that differ from the template, bad IDs or status values, empty or weak completion criteria, leftover `[placeholders]`, schedule or decision-log tables that belong elsewhere). The skill then adds **review** items that need a human: criteria that are not verifiable, scope tables that contradict the requirements, unconfirmed requirements described as delivered, open items without an owner or date.

## Script

```
node scripts/check.mjs <prd.md> --template <template.md> [--rules <rules.json>] [--report <path>] [--json] [--no-report]
```

Exit codes: 0 no errors (review items allowed), 1 errors found, 2 usage, file, template or rules problem. With `--json` the only stdout is one JSON line: `{ ok, file, template, rules, report, summary, findings, structure }` or `{ ok:false, code, message, hint }`.

## Development

```
cd plugins/prd-check && node --test tests/*.test.mjs
```

Fixtures under `tests/fixtures/` are fictional. No company template or customer document is part of this repository.
