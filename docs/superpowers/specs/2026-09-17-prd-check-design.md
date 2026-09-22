# prd-check — PRD standard checker plugin

Date: 2026-09-17. Fifth plugin in the `work-with-tony` marketplace.

## Goal

Check a PRD written in Markdown against a team's PRD template and a small rule file, and produce a report that names the line, the rule, and the fix. The script finds every structural violation deterministically; the skill adds judgment items that need reading. The PRD body is never modified.

## Non-goals

- PDF or HTML input. The team's editing original is Markdown; PDF is the published copy and too late to check.
- Auto-fix. A PRD is a customer-facing agreement; the tool leaves the body alone.
- Shipping any company's template or rules inside the plugin. The repository is public. Company standards live outside the plugin and are passed in.
- Scoring or ranking PRDs. Output is a list of findings, not a grade.

## Inputs

1. `prd.md` — the document under check.
2. `--template <template.md>` — the team's standard template. The script derives expected structure from it: heading order, table headers under each heading, and which sections sit inside `<!-- optional:start -->` … `<!-- optional:end -->`.
3. `--rules <rules.json>` — optional overrides merged over `skills/check/references/default-rules.json`. Rules cover what a template cannot express: allowed status and priority values, ID pattern, placeholder pattern, weak completion-criteria phrases, and which section may hold open items.

Defaults for both paths come from `$PRD_CHECK_HOME/config.json` (`PRD_CHECK_HOME` defaults to `~/.prd-check/`). The skill creates that file on first run after asking once.

### Default rule file

```json
{
  "requirementTable": {
    "section": "5.1",
    "idColumn": "ID",
    "idPattern": "^FR-\\d{3}$",
    "requirementColumn": "요구사항",
    "priorityColumn": "우선순위",
    "priorityValues": ["필수", "선택"],
    "statusColumn": "확정 상태",
    "statusValues": ["확정", "확인 필요", "보류"],
    "criteriaColumn": "완료 기준",
    "weakCriteria": ["정상 동작", "정상 작동", "사용하기 편함", "문제 없이", "잘 동작"]
  },
  "placeholderPattern": "^\\[.+\\]$",
  "requiredInfoSection": "1.1",
  "openItemsSection": "7.2",
  "openItemsHeaders": ["확인할 사항", "확인 담당", "확인 예정일"],
  "misplacedTableSignatures": [
    { "name": "schedule", "allOf": ["담당"], "anyOf": ["일정", "기한", "착수", "완료일"] },
    { "name": "decision-log", "anyOf": ["결정값", "승인일", "결정 로그"] }
  ]
}
```

Section references (`"5.1"`, `"7.2"`) match the numeric prefix of a heading in the PRD. Column and header names are matched after trimming and collapsing whitespace.

## Components

```
plugins/prd-check/
  .claude-plugin/plugin.json          name prd-check, version 0.1.0
  .codex-plugin/plugin.json
  package.json                        type module, node>=20, no dependencies
  README.md
  skills/check/SKILL.md
  skills/check/references/default-rules.json
  skills/check/references/review-guide.md
  scripts/check.mjs                   CLI entry
  scripts/lib/markdown.mjs            parseMarkdown(text) → { headings, tables, paragraphs, optionalRanges }
  scripts/lib/template.mjs            extractExpectations(doc) → { sections[], tablesBySection, optionalSections }
  scripts/lib/rules.mjs               loadRules(path?) → merged rules; throws RulesError on bad file
  scripts/lib/checks/structure.mjs
  scripts/lib/checks/tables.mjs
  scripts/lib/checks/requirements.mjs
  scripts/lib/checks/placeholders.mjs
  scripts/lib/checks/misplaced.mjs
  scripts/lib/report.mjs              toJson(result), toMarkdown(result)
  tests/                              node --test; fixtures under tests/fixtures/
```

### markdown.mjs

Line-based parser for the subset the template uses: ATX headings (`#`–`####`), pipe tables (header row, separator row, body rows), fenced code blocks (contents ignored), and the two optional-block comments. Every heading, table, table row and paragraph carries its 1-based line number. Headings expose `number` (e.g. `"5.1"`, parsed from a leading `\d+(\.\d+)*` prefix) and `title` (text after the number). Tables attach to the nearest preceding heading.

### template.mjs

From the parsed template: ordered list of `{ number, title, level, optional }` sections and, per section, the ordered list of table header arrays. Placeholder cells (`[…]`) in the template are ignored; only headers matter.

### Checks

Each check exports `run(doc, expectations, rules) → Finding[]` where `Finding = { rule, severity: "error" | "review", line, message, fix }`.

- **structure**: required section missing (`structure.missing`), sections out of template order (`structure.order`), section present in PRD but not in template (`structure.extra`, severity review). Optional sections may be absent.
- **tables**: table header differs from template for the same section and position (`tables.header`, lists missing and unexpected columns), section that has a table in the template but none in the PRD (`tables.missing`).
- **requirements** (on the table under `requirementTable.section`): ID does not match pattern (`requirements.id`), duplicate ID (`requirements.duplicate`), status not in `statusValues` (`requirements.status`), priority not in `priorityValues` (`requirements.priority`), empty requirement cell (`requirements.empty`), empty criteria cell (`requirements.criteria.empty`), criteria consisting only of a weak phrase (`requirements.criteria.weak`, error), criteria containing a weak phrase among other text (`requirements.criteria.weak`, review).
- **placeholders**: any cell or paragraph matching `placeholderPattern` (`placeholders.remaining`); empty value in the `requiredInfoSection` table (`placeholders.info`).
- **misplaced**: a table whose headers include all `openItemsHeaders` outside `openItemsSection` (`misplaced.openItems`); a table matching a `misplacedTableSignatures` entry anywhere (`misplaced.<name>`, e.g. `misplaced.schedule`).

### report.mjs

- JSON (stdout, one line): `{ ok: true, file, template, rules, summary: { lines, errorCount, reviewCount }, findings: [...], structure: { sections: [...], requirements: [rows with line numbers], scope: { included: [...], excluded: [...] }, openItems: [...] } }`. `ok:false` only when the check itself could not run (`{ ok:false, code, message, hint }`).
- Markdown report written to `<prd>.check.md` next to the PRD unless `--report <path>` is given. Sections: header block (file, template, rules, date, counts), `## 오류` table, `## 확인` table. The script writes script-level review findings into `## 확인` and leaves a marker line `<!-- skill-review -->` at the end of that section for the skill to append to.

### CLI

`node scripts/check.mjs <prd.md> --template <path> [--rules <path>] [--report <path>] [--json] [--no-report]`

Exit codes: 0 no errors (review findings allowed), 1 errors found, 2 usage, file, template or rules problem. Error codes for exit 2: `BAD_ARGS`, `FILE_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, `RULES_INVALID`, `NO_HEADINGS` (PRD has no headings at all), `NODE_TOO_OLD`.

### SKILL.md (`/prd-check:check`)

1. Resolve template and rules: flags first, then `config.json`, else ask once and save.
2. Run the script with `--json`. If `ok:false`, show code, message, hint and stop.
3. Read `structure` from the JSON and apply `references/review-guide.md`. Four judgment items, each producing `{ rule: "review.*", line, message, reason }`:
   - `review.criteria`: completion criteria without an observable condition and result.
   - `review.scope`: excluded-scope item that appears as a confirmed FR, or included-scope area with no FR.
   - `review.asserted`: an FR with status 확인 필요/보류 described as delivered in 4.2 or 5.2 text.
   - `review.openItems`: 7.2 rows missing owner or date.
   Use only the rows and line numbers the script provided; never re-read the whole PRD for line numbers.
4. Append the skill's items under the `<!-- skill-review -->` marker in the report file.
5. Reply with counts, the report path, and the three findings to fix first. Quote PRD text sparingly; cite line and rule.
6. Never edit the PRD. Never send the PRD or report anywhere.

## Testing

- `markdown.test.mjs`: headings with and without numbers, tables with ragged rows, code block ignored, optional ranges, line numbers.
- `template.test.mjs`: a fixture template with 8 sections, nested tables, and two optional blocks yields the expected structure.
- One test file per check with pass and fail fixtures; failures assert line numbers.
- `rules.test.mjs`: defaults load, partial override merges deeply, invalid JSON and wrong types raise `RulesError`.
- `check.test.mjs`: CLI JSON shape, report file written, exit codes 0/1/2.
- `plugin-package.test.mjs`: manifests, versions, no secrets, SKILL.md frontmatter and required references.
- Fixtures are fictional PRDs under `tests/fixtures/`. No customer document enters the repository. After implementation, a local smoke run against last week's two real PRDs is done manually.

## Open decisions already made

- Company standard stays outside the plugin; only a generic default rule file ships.
- Two severities: error (deterministic, script) and review (needs a human; script for phrase-level cases, skill for meaning-level cases).
- No auto-fix in 0.1.
