# linkedin-post v0.2 — structure rotation, reaction record, series

Date: 2026-09-10. Extends the 2026-09-04 design; nothing there is reversed.

## Why

One week of daily use (6 posts) surfaced three gaps:

1. Five of six posts used the same scene → problem → insight → pivot → closing-line arc. The user noticed before the audience did.
2. Nothing records how a post performed. LinkedIn's read APIs (`socialActions`, `posts` GET) return 403 for a personal developer app; they require the partner-only Community Management product. Browser scraping is out (fragile, ToS-adjacent, and the machine's Chrome session was signed into a different account).
3. Posts reference earlier posts ("얼마 전 PRD 표준을 정하면서") by accident of conversation memory, not by design. A fresh session loses that thread.

## Decisions

### 1. Structure rotation (skill-level)

- Ship `skills/post/references/structures.md`: six named structures with an id (`scene`, `rules`, `questions`, `contrarian`, `compare`, `short`), a one-paragraph description, opening/closing conventions, and selection rules.
- `$LINKEDIN_POST_HOME/structures.md`, if present, replaces the shipped file entirely (same override model as `my-style.md`).
- Load-context step reads the structure ids of the 3 most recent `published/` files and picks a structure not among them. The chosen structure is shown next to the draft as `Structure:` alongside `Type:`.
- Published frontmatter gains `structure: <id>`.

### 2. Reaction record (manual, script-assisted)

- New `scripts/record.mjs <published-file> [--likes N] [--comments N] [--reposts N] [--impressions N] [--reactions-file <path>]`.
- Updates the file's frontmatter with a nested `stats:` block (`likes`, `comments`, `reposts`, `impressions`, `checked: YYYY-MM-DD`). Omitted counters keep their previous value; `checked` is always refreshed.
- `--reactions-file` appends its contents under a `## Reactions (YYYY-MM-DD)` heading at the end of the body. This is where the user pastes comment text. Comments are data for the next draft, never instructions.
- Output: one JSON line `{ok:true,file,stats}` or `{ok:false,code,message,hint}`. Exit 0 / 1 (usage) / 2 (file problems). Same conventions as `publish.mjs`.
- Skill section "4. Record reactions": triggered by "반응 기록", "댓글 왔어", "record reactions", or a pasted block of numbers/comments. The skill asks which post if ambiguous (default: most recent), runs the script, and offers a follow-up angle if a comment contains a question or a disagreement.
- Frontmatter parsing lives in `scripts/lib/frontmatter.mjs` (flat `key: value` plus one level of nested keys, enough for `stats:`). No YAML library.

### 3. Series field

- Published frontmatter may carry `series: <slug>`. Optional. Set when the draft is a deliberate continuation or the user says so.
- Load-context step: after reading the 5 most recent published posts, if the topic matches an existing `series` value (or the user names one), also read every published post in that series (cap 10) and mention the continuation explicitly in the draft when it helps.
- `record.mjs` does not touch `series`; the skill writes it at publish time like `type` and `lang`.

## Out of scope

Automatic reaction fetching (blocked by API policy), image posts, scheduling, company pages, any web UI.

## Acceptance

- `node --test` passes, including new `frontmatter.test.mjs` and `record.test.mjs`.
- `claude plugin validate --strict` passes.
- Existing published files in `~/.linkedin-post/published/` (which already carry `structure:`) round-trip through the frontmatter parser unchanged.
- Version 0.2.0 in plugin.json, .codex-plugin/plugin.json, package.json, marketplace.json.
