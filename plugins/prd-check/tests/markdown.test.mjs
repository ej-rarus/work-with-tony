import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown } from "../scripts/lib/markdown.mjs";

const SAMPLE = `# 프로젝트 - 요구사항서
intro line

## 1. 문서 정보

### 1.1 기본 정보

| 항목 | 내용 |
| --- | --- |
| 프로젝트명 | 데모 |
| 고객사 | [고객사명] |

<!-- optional:start -->
### 5.2 기능 상세 설명
**전제 조건:** 없음
<!-- optional:end -->

\`\`\`
| not | a table |
## not a heading
\`\`\`

## 5. 기능 요구사항
| ID | 요구사항 | 완료 기준 |
|---|---|---|
| FR-001 | 사용자가 로그인한다 | 로그인 후 홈으로 이동 |
| FR-002 | 사용자가 로그아웃한다 |
`;

test("parses headings with number, title, level and line", () => {
  const doc = parseMarkdown(SAMPLE);
  assert.deepEqual(doc.headings.map((h) => [h.line, h.level, h.number, h.title]), [
    [1, 1, null, "프로젝트 - 요구사항서"],
    [4, 2, "1", "문서 정보"],
    [6, 3, "1.1", "기본 정보"],
    [14, 3, "5.2", "기능 상세 설명"],
    [23, 2, "5", "기능 요구사항"],
  ]);
});

test("parses tables with header, rows, line numbers and owning heading", () => {
  const doc = parseMarkdown(SAMPLE);
  assert.equal(doc.tables.length, 2);
  const info = doc.tables[0];
  assert.equal(info.line, 8);
  assert.deepEqual(info.headers, ["항목", "내용"]);
  assert.deepEqual(info.rows, [
    { line: 10, cells: ["프로젝트명", "데모"] },
    { line: 11, cells: ["고객사", "[고객사명]"] },
  ]);
  assert.equal(doc.headings[info.headingIndex].number, "1.1");
  const fr = doc.tables[1];
  assert.deepEqual(fr.headers, ["ID", "요구사항", "완료 기준"]);
  assert.deepEqual(fr.rows[1], { line: 27, cells: ["FR-002", "사용자가 로그아웃한다"] });
});

test("ignores fenced code blocks and records optional ranges", () => {
  const doc = parseMarkdown(SAMPLE);
  assert.ok(!doc.headings.some((h) => h.title.includes("not a heading")));
  assert.ok(!doc.tables.some((t) => t.headers.includes("not")));
  assert.deepEqual(doc.optionalRanges, [{ start: 13, end: 16 }]);
});

test("collects paragraphs with owning heading and skips table and heading lines", () => {
  const doc = parseMarkdown(SAMPLE);
  const texts = doc.paragraphs.map((p) => [p.line, p.text, p.headingIndex]);
  assert.deepEqual(texts[0], [2, "intro line", 0]);
  assert.ok(texts.some(([line, text]) => line === 15 && text === "**전제 조건:** 없음"));
  assert.ok(!doc.paragraphs.some((p) => p.text.startsWith("|")));
});

test("handles CRLF input and an empty document", () => {
  assert.equal(parseMarkdown("## 1. A\r\n| x |\r\n|---|\r\n| y |\r\n").tables[0].rows[0].cells[0], "y");
  const empty = parseMarkdown("");
  assert.deepEqual(empty.headings, []);
  assert.deepEqual(empty.tables, []);
});
