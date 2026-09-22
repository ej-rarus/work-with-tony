import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown } from "../scripts/lib/markdown.mjs";
import { loadRules } from "../scripts/lib/rules.mjs";
import { run } from "../scripts/lib/checks/placeholders.mjs";
import { fixture } from "./helpers.mjs";

const rules = loadRules();

test("the untouched template is full of placeholders", () => {
  const found = run(parseMarkdown(fixture("template.md")), {}, rules);
  assert.ok(found.filter((f) => f.rule === "placeholders.remaining").length > 20);
  assert.ok(found.every((f) => f.severity === "error"));
});

test("reports placeholder cells and paragraphs with their line", () => {
  const md = "## 2. 배경\n\n### 2.1 배경\n\n[현재 상황]\n\n| 목표 | 기대 결과 |\n|---|---|\n| 매출 | [기대 결과] |\n";
  const found = run(parseMarkdown(md), {}, rules).filter((f) => f.rule === "placeholders.remaining");
  assert.deepEqual(found.map((f) => f.line), [5, 9]);
});

test("reports blank or placeholder values in the required info table", () => {
  const md = "### 1.1 기본 정보\n\n| 항목 | 내용 |\n|---|---|\n| 프로젝트명 | 데모 |\n| 고객사 |  |\n| 작성자 | [작성자명] |\n";
  const info = run(parseMarkdown(md), {}, rules).filter((f) => f.rule === "placeholders.info");
  assert.deepEqual(info.map((f) => [f.line, f.message.includes("고객사") || f.message.includes("작성자")]), [[6, true], [7, true]]);
});

test("does not flag ordinary bracketed references inside text", () => {
  const md = "### 2.1 배경\n\n정책 문서 [v1.2] 기준으로 진행합니다.\n";
  assert.deepEqual(run(parseMarkdown(md), {}, rules), []);
});
