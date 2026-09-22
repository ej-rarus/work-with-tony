import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown } from "../scripts/lib/markdown.mjs";
import { extractExpectations } from "../scripts/lib/template.mjs";
import { loadRules } from "../scripts/lib/rules.mjs";
import { run } from "../scripts/lib/checks/tables.mjs";
import { fixture } from "./helpers.mjs";

const exp = extractExpectations(parseMarkdown(fixture("template.md")));
const rules = loadRules();

test("template against itself has no table findings", () => {
  assert.deepEqual(run(parseMarkdown(fixture("template.md")), exp, rules), []);
});

test("reports a header mismatch with missing and unexpected columns", () => {
  const md = fixture("template.md").replace(
    "| ID | 요구사항 | 우선순위 | 확정 상태 | 완료 기준 |",
    "| ID | 요구사항 | 우선순위 | 상태 | 인수 기준 |",
  );
  const found = run(parseMarkdown(md), exp, rules).filter((f) => f.rule === "tables.header");
  assert.equal(found.length, 1);
  assert.match(found[0].message, /확정 상태/);
  assert.match(found[0].message, /상태/);
  assert.equal(found[0].line, parseMarkdown(md).tables.find((t) => t.headers.includes("인수 기준")).line);
});

test("reports a section whose template table is absent", () => {
  const md = fixture("template.md").replace(/\| 항목 \| 제약 내용 \| 적용 범위·영향 \|\n\| --- \| --- \| --- \|\n\| \[항목\] \| \[제약\] \| \[영향\] \|\n/, "");
  const found = run(parseMarkdown(md), exp, rules).filter((f) => f.rule === "tables.missing");
  assert.equal(found.length, 1);
  assert.match(found[0].message, /6\.2/);
});

test("ignores whitespace differences in headers", () => {
  const md = fixture("template.md").replace("| 확정 상태 |", "|  확정  상태 |");
  assert.deepEqual(run(parseMarkdown(md), exp, rules), []);
});
