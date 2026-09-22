import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown } from "../scripts/lib/markdown.mjs";
import { extractExpectations } from "../scripts/lib/template.mjs";
import { fixture } from "./helpers.mjs";

const exp = extractExpectations(parseMarkdown(fixture("template.md")));

test("lists numbered sections in order with levels", () => {
  const numbers = exp.sections.map((s) => s.number);
  assert.deepEqual(numbers.slice(0, 6), ["1", "1.1", "1.2", "2", "2.1", "2.2"]);
  assert.equal(exp.sections.length, 25);
  assert.equal(exp.sections.find((s) => s.number === "5.1").level, 3);
  assert.equal(exp.sections.find((s) => s.number === "5.1").title, "기능 요구사항 목록");
});

test("attaches table headers to their section in order", () => {
  const fr = exp.sections.find((s) => s.number === "5.1");
  assert.deepEqual(fr.tables, [["ID", "요구사항", "우선순위", "확정 상태", "완료 기준"]]);
  const info = exp.sections.find((s) => s.number === "1.1");
  assert.deepEqual(info.tables, [["항목", "내용"]]);
  assert.deepEqual(exp.sections.find((s) => s.number === "2.1").tables, []);
});

test("marks sections inside optional blocks", () => {
  assert.equal(exp.sections.find((s) => s.number === "5.2").optional, true);
  assert.equal(exp.sections.find((s) => s.number === "5.3").optional, true);
  assert.equal(exp.sections.find((s) => s.number === "5.1").optional, false);
});

test("ignores the unnumbered document title", () => {
  assert.ok(!exp.sections.some((s) => s.number === null));
});
