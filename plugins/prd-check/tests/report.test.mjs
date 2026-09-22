import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown } from "../scripts/lib/markdown.mjs";
import { loadRules } from "../scripts/lib/rules.mjs";
import { SKILL_MARKER, buildResult, buildStructure, toJson, toMarkdown } from "../scripts/lib/report.mjs";
import { fixture } from "./helpers.mjs";

const rules = loadRules();
const doc = parseMarkdown(fixture("prd-pass.md"));

test("buildStructure extracts sections, requirements, scope and open items with lines", () => {
  const s = buildStructure(doc, rules);
  assert.ok(s.sections.some((x) => x.number === "5.1"));
  assert.equal(s.requirements.length, 2);
  assert.equal(s.requirements[0].id, "FR-001");
  assert.equal(s.requirements[1].status, "확인 필요");
  assert.ok(s.requirements[0].line > 0);
  assert.equal(s.scope.included[0].area, "주문 관리");
  assert.equal(s.scope.excluded[0].area, "정산");
  assert.equal(s.openItems.length, 1);
  assert.ok(s.openItems[0].owner.length > 0);
});

test("buildResult counts severities and toJson is one line", () => {
  const findings = [
    { rule: "a", severity: "error", line: 3, message: "m", fix: "f" },
    { rule: "b", severity: "review", line: 9, message: "m", fix: "f" },
  ];
  const result = buildResult({ file: "p.md", template: "t.md", rules: "default", doc, findings, rulesObject: rules });
  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, { lines: doc.lines.length, errorCount: 1, reviewCount: 1 });
  assert.equal(toJson(result).split("\n").length, 1);
  assert.equal(JSON.parse(toJson(result)).findings.length, 2);
});

test("toMarkdown renders header, error and review tables and the skill marker", () => {
  const findings = [
    { rule: "requirements.status", severity: "error", line: 40, message: "상태 오류", fix: "고치세요" },
    { rule: "structure.extra", severity: "review", line: 80, message: "추가 절", fix: "확인" },
  ];
  const result = buildResult({ file: "p.md", template: "t.md", rules: "default", doc, findings, rulesObject: rules });
  const md = toMarkdown(result, { date: "2026-09-18" });
  assert.match(md, /^# PRD 검사 결과\n/);
  assert.match(md, /오류 1 · 확인 1/);
  assert.match(md, /## 오류\n\n\| 줄 \| 규칙 \| 내용 \| 조치 \|\n\| --- \| --- \| --- \| --- \|\n\| 40 \| requirements\.status \| 상태 오류 \| 고치세요 \|/);
  assert.match(md, /## 확인\n\n[\s\S]*\| 80 \| structure\.extra \| 추가 절 \| 확인 \|/);
  assert.ok(md.trimEnd().endsWith(SKILL_MARKER));
});

test("toMarkdown says 없음 when a section has no findings", () => {
  const result = buildResult({ file: "p.md", template: "t.md", rules: "default", doc, findings: [], rulesObject: rules });
  const md = toMarkdown(result, { date: "2026-09-18" });
  assert.match(md, /## 오류\n\n없음/);
});
