# Fill plan format

`fill` takes a JSON file with one `ops` array. Each op names one cell by the `table`, `row`, and `col` that `inspect` printed, and does exactly one thing.

```json
{
  "ops": [
    { "table": 1, "row": 2, "col": 2, "set": "홍길동" },
    { "table": 1, "row": 0, "col": 1, "check": "개인" },
    { "table": 1, "row": 19, "col": 0, "find": "월     일", "replace": "5월  6일" }
  ]
}
```

| Op | Use it for | Rules |
|---|---|---|
| `set` | An empty answer cell, or a cell whose whole text is a placeholder | Replaces the cell's text and keeps its paragraph and character style. `\n` starts a new paragraph. Refused (`CELL_HAS_OBJECTS`) on a cell that holds a nested table or object. |
| `check` | `□ 개인  □ 단체` style choices | Turns the box right before the label into `■` (or `mark`, e.g. `"☑"`). The label must match a whole word: `개인` does not match `개인사업자`. |
| `find` + `replace` | Part of a cell: a date line, `팀명(    )`, a blank inside a sentence | `find` must appear exactly once in the cell's own text and inside one formatting run. Copy it from `inspect`, spaces included. |

## Addresses

- `row` and `col` are the cell's logical position in the table grid. A merged block is addressed by its top-left cell. Never count cells across a row yourself; use the numbers `inspect` prints.
- Tables are numbered in document order starting at 0, including tables nested inside other tables. A nested table's `parent` tells you which cell holds it.
- `inspect` shows only text. An empty `text` is an empty cell.

## When an op fails

Nothing is written unless every op applies, every planned cell reads back with exactly the expected text, every other cell is unchanged, and the edited XML stays well formed. Text values may not contain tabs or control characters. The JSON result names the failing `op` index and a `code`:

| Code | What to do |
|---|---|
| `CELL_NOT_FOUND` | Re-read `inspect`; you likely used a column inside a merged block. |
| `CELL_HAS_OBJECTS` | Use `check` or `find`+`replace`, or fill the nested table's own cells. |
| `CHECK_NOT_FOUND` / `CHECK_AMBIGUOUS` | Match the label exactly as printed; use a longer label if two boxes share it. |
| `FIND_NOT_FOUND` | Copy the text again from `inspect`, including every space. |
| `FIND_SPLIT` | The text spans two formatting runs. The result lists the cell's `runs`; choose a `find` that sits inside one of them. |
| `FIND_AMBIGUOUS` | Include more surrounding text so it occurs once. |
| `VERIFY_FAILED` | The result lists `failures` (a planned cell with the wrong text, a cell that changed without being planned, or broken section XML). Stop and report it; do not work around it. |
