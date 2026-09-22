import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown } from "../scripts/lib/markdown.mjs";
import { loadRules } from "../scripts/lib/rules.mjs";
import { run } from "../scripts/lib/checks/requirements.mjs";

const rules = loadRules();
const HEAD = "### 5.1 기능 요구사항 목록\n\n| ID | 요구사항 | 우선순위 | 확정 상태 | 완료 기준 |\n| --- | --- | --- | --- | --- |\n";

function check(rows) {
  return run(parseMarkdown(HEAD + rows), {}, rules);
}

test("clean rows produce no findings", () => {
  assert.deepEqual(check("| FR-001 | 사용자가 로그인한다 | 필수 | 확정 | 로그인 후 홈으로 이동한다 |\n"), []);
});

test("flags bad id, duplicate id, bad status and bad priority with the row line", () => {
  const found = check([
    "| FR-1 | a | 필수 | 확정 | 결과 |",
    "| FR-002 | b | 중요 | IN·PARTIAL | 결과 |",
    "| FR-002 | c | 필수 | 확정 | 결과 |",
  ].join("\n") + "\n");
  const byRule = Object.fromEntries(found.map((f) => [f.rule, f]));
  assert.equal(byRule["requirements.id"].line, 5);
  assert.equal(byRule["requirements.priority"].line, 6);
  assert.equal(byRule["requirements.status"].line, 6);
  assert.match(byRule["requirements.status"].message, /IN·PARTIAL/);
  assert.equal(byRule["requirements.duplicate"].line, 7);
  assert.ok(found.every((f) => f.severity === "error"));
});

test("flags empty requirement and empty criteria", () => {
  const found = check("| FR-001 |  | 필수 | 확정 |  |\n");
  assert.deepEqual(found.map((f) => f.rule).sort(), ["requirements.criteria.empty", "requirements.empty"]);
});

test("weak criteria: only-weak is an error, contains-weak is review", () => {
  const found = check([
    "| FR-001 | a | 필수 | 확정 | 정상 동작 |",
    "| FR-002 | b | 필수 | 확정 | 정상 동작한다. |",
    "| FR-003 | c | 필수 | 확정 | 필터 선택 시 정상 동작하고 목록이 갱신된다 |",
  ].join("\n") + "\n");
  const weak = found.filter((f) => f.rule === "requirements.criteria.weak");
  assert.deepEqual(weak.map((f) => [f.line, f.severity]), [[5, "error"], [6, "error"], [7, "review"]]);
});

test("skips silently when the requirement table or a column is absent", () => {
  assert.deepEqual(run(parseMarkdown("## 5. 기능 요구사항\n텍스트\n"), {}, rules), []);
  const noStatus = "### 5.1 x\n\n| ID | 요구사항 | 완료 기준 |\n|---|---|---|\n| FR-001 | a | b |\n";
  assert.deepEqual(run(parseMarkdown(noStatus), {}, rules), []);
});
