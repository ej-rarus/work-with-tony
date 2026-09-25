# hwp-form

Fill Korean HWP/HWPX application forms (지원사업 신청서, 참가신청서, 동의서) from a saved profile and the materials you point to. The result is a new HWPX copy plus a checklist of what is still yours to do. The original form is never modified.

## In short

Give it a blank application form; get back a filled copy and a short list of what only you can do.

## Example

Applying to a local start-up support programme with its `.hwpx` application form:

1. You say: `/hwp-form:fill ~/Downloads/신청서.hwpx 사업계획은 ~/notes/plan.md 참고해`.
2. It reads the form and shows a map before writing anything: name, birth date, address, phone, career and certificates come from your profile; 창업 동기, item overview and marketing plan are drafted from `plan.md`; □개인/□단체 and 지원경로 are asked; signature, (인), consent and pledge boxes, and the submission date are left blank.
3. You confirm or correct the map. It writes `신청서-작성본-20260925.hwpx` next to the original.
4. It ends with what is left, for example: sign in 2 places, tick 1 consent box, attach 2 documents, delete the 유의사항 box before submitting.
5. You open the copy in Hancom Office, review, sign, and submit.

## What it fills and what it leaves

| Group | Examples | What happens |
|---|---|---|
| 채움 | 성명, 연락처, 주소, 사업자등록번호, 경력, 자격증 | Filled from `~/.hwp-form/profile.md` |
| 초안 | 창업 동기, 아이템 개요, 추진 일정 | Drafted only from your material; gaps are marked `확인 필요` |
| 선택 | □개인 / □단체, 지원경로 | Checked only when you say which |
| 비움 | signature, (인), consent and pledge boxes, submission date | Always left for you |

You see the full map before anything is written, and nothing is submitted anywhere.

## Install

Claude Code:

```text
/plugin marketplace add ej-rarus/work-with-tony
/plugin install hwp-form@work-with-tony
```

Codex:

```text
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add hwp-form@work-with-tony
```

Requires Node.js 20 or newer. No npm dependencies. Start a new session or task after installing.

## Usage

```text
/hwp-form:fill ~/Downloads/참가신청서.hwpx
/hwp-form:fill ~/Downloads/신청서.hwpx 사업계획서는 ~/notes/plan.md 참고해서 채워줘
```

In Codex type `$hwp-form:fill` with the same arguments.

### `.hwp` files

Binary `.hwp` files cannot be written safely by any open-source tool today. Open the form in Hancom Office, choose 파일 > 다른 이름으로 저장, set the format to **HWPX**, and give the skill that copy. The skill tells you when this is needed.

### Profile

The first run offers to create `~/.hwp-form/profile.md` from facts you confirm in conversation: name, contact details, business registration, career, certificates, and past support programmes. Edit it by hand any time. Override the folder with `HWP_FORM_HOME`.

## How the writing is kept safe

The bundled script edits the HWPX package directly instead of relying on generic HWP tools, because forms break them in quiet ways:

- **Empty answer cells** usually have no text element at all. Generic cell writers skip them and still report success. This script builds the text element and reads it back.
- **Merged cells** are addressed by the logical row/column the document records, so a merged block never shifts a write into the neighbouring cell.
- **Nested tables** are kept separate: a cell's own text and the table inside it are never confused.
- Text that spans two formatting runs is reported with the list of runs, instead of being half-replaced.
- Every write is verified by re-reading the new file. If any value does not read back exactly, nothing is saved.

Formatting (paragraph and character style) comes from the cell being filled. Stale layout data in edited cells is dropped so Hancom Office lays the text out again when the file opens.

## Script

```text
node scripts/hwp-form.mjs inspect --file form.hwpx [--table N]
node scripts/hwp-form.mjs fill --file form.hwpx --plan plan.json --out new.hwpx
```

Both print one JSON line. Exit codes: 0 success, 1 an op or verification failed, 2 input or usage problem (`HWP_BINARY`, `BAD_PLAN`, `OUTPUT_EXISTS`, …). The plan format is in `skills/fill/references/plan-format.md`.

## Limits

- Writes HWPX only; `.hwp` needs the one-time save-as step above.
- Fills table cells. Free text outside tables and text boxes are left alone.
- It does not sign, stamp, tick consent, or submit.
- Always open the result in Hancom Office before submitting: check line breaks and page count, then sign and save in the format the organisation asks for.

## Development

```text
npm test
claude plugin validate . --strict
```

Tests build their own HWPX fixtures; no real form or personal data is stored in this repository.
