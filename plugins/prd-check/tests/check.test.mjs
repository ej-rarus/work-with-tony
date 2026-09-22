import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CheckError, parseArgs, runCheck } from "../scripts/check.mjs";
import { fixture, makeTempDir, pluginRoot } from "./helpers.mjs";

const TEMPLATE = join(pluginRoot, "tests", "fixtures", "template.md");

function capture() {
  let out = "";
  return { stdout: { write: (s) => { out += s; } }, read: () => out };
}

test("parseArgs reads file, template, rules, report, json and no-report", () => {
  const a = parseArgs(["p.md", "--template", "t.md", "--rules", "r.json", "--report", "out.md", "--json", "--no-report"]);
  assert.deepEqual(a, { file: "p.md", template: "t.md", rules: "r.json", report: "out.md", json: true, writeReport: false });
  assert.throws(() => parseArgs(["p.md"]), (e) => e instanceof CheckError && e.code === "BAD_ARGS");
  assert.throws(() => parseArgs(["p.md", "--template", "t.md", "--bogus"]), (e) => e.code === "BAD_ARGS");
});

test("a passing PRD exits 0, prints JSON, and writes a report next to the file", () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const prd = join(dir, "good.md");
    writeFileSync(prd, fixture("prd-pass.md"));
    const io = capture();
    const code = runCheck([prd, "--template", TEMPLATE, "--json"], { stdout: io.stdout, now: () => Date.parse("2026-09-18T00:00:00Z") });
    const result = JSON.parse(io.read().trim());
    assert.equal(code, 0, JSON.stringify(result.findings));
    assert.equal(result.ok, true);
    assert.equal(result.summary.errorCount, 0);
    assert.ok(existsSync(join(dir, "good.check.md")));
    assert.match(readFileSync(join(dir, "good.check.md"), "utf8"), /2026-09-18/);
  } finally {
    cleanup();
  }
});

test("a failing PRD exits 1 and reports every planted violation", () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const prd = join(dir, "bad.md");
    writeFileSync(prd, fixture("prd-fail.md"));
    const io = capture();
    const code = runCheck([prd, "--template", TEMPLATE, "--json", "--no-report"], { stdout: io.stdout });
    assert.equal(code, 1);
    const rules = new Set(JSON.parse(io.read().trim()).findings.map((f) => f.rule));
    for (const expected of [
      "structure.missing", "tables.header", "requirements.duplicate", "requirements.status",
      "placeholders.info", "placeholders.remaining", "misplaced.schedule", "misplaced.openItems", "requirements.criteria.weak",
    ]) assert.ok(rules.has(expected), `missing ${expected}`);
    assert.ok(!existsSync(join(dir, "bad.check.md")));
  } finally {
    cleanup();
  }
});

test("missing files and a PRD without headings exit 2 with a code", () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const io1 = capture();
    assert.equal(runCheck(["/nope/prd.md", "--template", TEMPLATE, "--json"], { stdout: io1.stdout }), 2);
    assert.equal(JSON.parse(io1.read()).code, "FILE_NOT_FOUND");
    const prd = join(dir, "flat.md");
    writeFileSync(prd, "그냥 텍스트\n");
    const io2 = capture();
    assert.equal(runCheck([prd, "--template", "/nope/t.md", "--json"], { stdout: io2.stdout }), 2);
    assert.equal(JSON.parse(io2.read()).code, "TEMPLATE_NOT_FOUND");
    const io3 = capture();
    assert.equal(runCheck([prd, "--template", TEMPLATE, "--json"], { stdout: io3.stdout }), 2);
    assert.equal(JSON.parse(io3.read()).code, "NO_HEADINGS");
  } finally {
    cleanup();
  }
});

test("an unexpected error is reported as UNKNOWN with a hint", () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const prd = join(dir, "good.md");
    writeFileSync(prd, fixture("prd-pass.md"));
    const io = capture();
    const readFile = () => { throw new Error("boom"); };
    const code = runCheck([prd, "--template", TEMPLATE, "--json"], { stdout: io.stdout, readFile });
    const payload = JSON.parse(io.read().trim());
    assert.equal(code, 2);
    assert.equal(payload.code, "UNKNOWN");
    assert.match(payload.message, /boom/);
    assert.ok(payload.hint, "UNKNOWN payload should include a hint");
  } finally {
    cleanup();
  }
});
