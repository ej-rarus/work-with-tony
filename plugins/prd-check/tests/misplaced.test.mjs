import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown } from "../scripts/lib/markdown.mjs";
import { loadRules } from "../scripts/lib/rules.mjs";
import { run } from "../scripts/lib/checks/misplaced.mjs";
import { fixture } from "./helpers.mjs";

const rules = loadRules();
const OPEN = "| 확인할 사항 | 관련 범위·요구사항 | 확인 담당 | 확인 예정일 |\n|---|---|---|---|\n| q | FR-001 | PM | 2026-10-01 |\n";

test("the template has no misplaced tables", () => {
  assert.deepEqual(run(parseMarkdown(fixture("template.md")), {}, rules), []);
});

test("open-items table outside 7.2 is reported", () => {
  const md = "### 5.1 기능\n\n" + OPEN + "\n### 7.2 미확정 사항\n\n" + OPEN;
  const found = run(parseMarkdown(md), {}, rules).filter((f) => f.rule === "misplaced.openItems");
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 3);
});

test("schedule and decision-log tables are reported by signature name", () => {
  const md = "### 4.2 흐름\n\n| 작업 | 담당 | 일정 |\n|---|---|---|\n| a | b | 9/15 |\n\n### 6.2 제약\n\n| 질문 | 결정값 | 승인일 |\n|---|---|---|\n| q | v | d |\n";
  const found = run(parseMarkdown(md), {}, rules);
  assert.deepEqual(found.map((f) => [f.rule, f.line]), [["misplaced.schedule", 3], ["misplaced.decision-log", 9]]);
  assert.ok(found.every((f) => f.severity === "error"));
});

test("a table with 담당 but no schedule column is not a schedule", () => {
  const md = "### 7.1 선행\n\n| 준비 항목 | 제공·확인 담당 | 필요한 시점 |\n|---|---|---|\n| a | b | c |\n";
  assert.deepEqual(run(parseMarkdown(md), {}, rules), []);
});
