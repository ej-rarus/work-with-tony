import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdown } from "../scripts/lib/markdown.mjs";
import { extractExpectations } from "../scripts/lib/template.mjs";
import { loadRules } from "../scripts/lib/rules.mjs";
import { run } from "../scripts/lib/checks/structure.mjs";
import { fixture } from "./helpers.mjs";

const exp = extractExpectations(parseMarkdown(fixture("template.md")));
const rules = loadRules();

function check(md) {
  return run(parseMarkdown(md), exp, rules);
}

test("a PRD with every required section in order has no structure findings", () => {
  assert.deepEqual(check(fixture("template.md")), []);
});

test("reports a missing required section at the previous heading's line", () => {
  const md = fixture("template.md").replace(/### 3\.2 제외 범위[\s\S]*?(?=## 4\.)/, "");
  const found = check(md);
  const missing = found.filter((f) => f.rule === "structure.missing");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].severity, "error");
  assert.match(missing[0].message, /3\.2/);
  const prev = parseMarkdown(md).headings.find((h) => h.number === "3.1");
  assert.equal(missing[0].line, prev.line);
});

test("optional sections may be absent", () => {
  const md = fixture("template.md").replace(/<!-- optional:start -->[\s\S]*?<!-- optional:end -->\n\n/g, "");
  assert.deepEqual(check(md).filter((f) => f.rule === "structure.missing"), []);
});

test("reports out-of-order sections", () => {
  const src = fixture("template.md");
  const s2 = src.slice(src.indexOf("## 2. "), src.indexOf("## 3. "));
  const s3 = src.slice(src.indexOf("## 3. "), src.indexOf("## 4. "));
  const md = src.replace(s2 + s3, s3 + s2);
  const order = check(md).filter((f) => f.rule === "structure.order");
  assert.ok(order.length >= 1);
  assert.match(order[0].message, /2/);
});

test("flags a numbered section that is not in the template as review", () => {
  const md = fixture("template.md") + "\n## 9. 일정\n\n텍스트\n";
  const extra = check(md).filter((f) => f.rule === "structure.extra");
  assert.equal(extra.length, 1);
  assert.equal(extra[0].severity, "review");
  assert.match(extra[0].message, /9/);
});
