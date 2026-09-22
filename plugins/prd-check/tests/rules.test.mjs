import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { RulesError, loadRules } from "../scripts/lib/rules.mjs";
import { makeTempDir } from "./helpers.mjs";

test("loads defaults when no path is given", () => {
  const rules = loadRules();
  assert.equal(rules.requirementTable.section, "5.1");
  assert.deepEqual(rules.requirementTable.statusValues, ["확정", "확인 필요", "보류"]);
  assert.equal(rules.openItemsSection, "7.2");
});

test("deep-merges a partial override: nested keys merge, arrays replace", () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const p = join(dir, "rules.json");
    writeFileSync(p, JSON.stringify({ requirementTable: { statusValues: ["확정", "미정"] }, openItemsSection: "9.1" }));
    const rules = loadRules(p);
    assert.deepEqual(rules.requirementTable.statusValues, ["확정", "미정"]);
    assert.equal(rules.requirementTable.idPattern, "^FR-\\d{3}$");
    assert.equal(rules.openItemsSection, "9.1");
    assert.equal(loadRules().requirementTable.statusValues.length, 3, "defaults must not be mutated");
  } finally {
    cleanup();
  }
});

test("rejects a missing file, invalid JSON, and wrong types", () => {
  const { dir, cleanup } = makeTempDir();
  try {
    assert.throws(() => loadRules(join(dir, "nope.json")), (e) => e instanceof RulesError && e.code === "RULES_NOT_FOUND");
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{ not json");
    assert.throws(() => loadRules(bad), (e) => e.code === "RULES_INVALID");
    const wrong = join(dir, "wrong.json");
    writeFileSync(wrong, JSON.stringify({ requirementTable: { statusValues: "확정" } }));
    assert.throws(() => loadRules(wrong), (e) => e.code === "RULES_INVALID" && /statusValues/.test(e.message));
    const badRegex = join(dir, "regex.json");
    writeFileSync(badRegex, JSON.stringify({ placeholderPattern: "[" }));
    assert.throws(() => loadRules(badRegex), (e) => e.code === "RULES_INVALID" && /placeholderPattern/.test(e.message));
  } finally {
    cleanup();
  }
});
