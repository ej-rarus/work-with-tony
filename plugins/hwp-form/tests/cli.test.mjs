import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { run } from "../scripts/hwp-form.mjs";
import { sampleHwpx } from "./fixture.mjs";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "hwp-form-test-"));
  const form = join(dir, "신청서.hwpx");
  writeFileSync(form, sampleHwpx());
  const out = [];
  const exec = (argv) => run(argv, { stdout: (line) => out.push(line) }).then((code) => ({ code, json: JSON.parse(out.at(-1)) }));
  return { dir, form, exec, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const writePlan = (dir, ops) => {
  const path = join(dir, "plan.json");
  writeFileSync(path, JSON.stringify({ ops }));
  return path;
};

test("inspect lists tables with logical cell addresses", async () => {
  const { form, exec, cleanup } = setup();
  const { code, json } = await exec(["inspect", "--file", form]);
  assert.equal(code, 0);
  assert.equal(json.ok, true);
  assert.equal(json.tables.length, 3);
  assert.deepEqual(json.tables[0].cells[3], { row: 1, col: 1, rowSpan: 1, colSpan: 3, text: "" });
  assert.equal(json.tables[0].cells[3].xml, undefined, "raw XML stays out of the output");
  const only = await exec(["inspect", "--file", form, "--table", "2"]);
  assert.deepEqual(only.json.tables.map((t) => t.index), [2]);
  cleanup();
});

test("fill writes a new file, verifies every op, and leaves the form untouched", async () => {
  const { dir, form, exec, cleanup } = setup();
  const before = readFileSync(form);
  const plan = writePlan(dir, [
    { table: 0, row: 0, col: 1, check: "개인" },
    { table: 0, row: 1, col: 1, set: "이은재" },
    { table: 0, row: 3, col: 2, set: "tony@example.com" },
  ]);
  const outPath = join(dir, "신청서-작성본.hwpx");
  const { code, json } = await exec(["fill", "--file", form, "--plan", plan, "--out", outPath]);
  assert.equal(code, 0);
  assert.equal(json.ok, true);
  assert.equal(json.applied, 3);
  assert.deepEqual(json.verified.map((v) => v.ok), [true, true, true]);
  assert.ok(existsSync(outPath));
  assert.deepEqual(readFileSync(form), before);
  const check = await exec(["inspect", "--file", outPath, "--table", "0"]);
  assert.equal(check.json.tables[0].cells[3].text, "이은재");
  cleanup();
});

test("fill refuses to overwrite and writes nothing when an op fails", async () => {
  const { dir, form, exec, cleanup } = setup();
  const plan = writePlan(dir, [{ table: 0, row: 1, col: 1, set: "ok" }, { table: 0, row: 0, col: 1, check: "법인" }]);
  const outPath = join(dir, "out.hwpx");
  const failed = await exec(["fill", "--file", form, "--plan", plan, "--out", outPath]);
  assert.equal(failed.code, 1);
  assert.equal(failed.json.code, "CHECK_NOT_FOUND");
  assert.equal(failed.json.op, 1);
  assert.ok(!existsSync(outPath));

  const same = await exec(["fill", "--file", form, "--plan", writePlan(dir, [{ table: 0, row: 1, col: 1, set: "x" }]), "--out", form]);
  assert.equal(same.json.code, "OUTPUT_EXISTS");
  cleanup();
});

test("binary .hwp and bad arguments get a clear code and hint", async () => {
  const { dir, exec, cleanup } = setup();
  const hwp = join(dir, "old.hwp");
  writeFileSync(hwp, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]));
  const binary = await exec(["inspect", "--file", hwp]);
  assert.equal(binary.code, 2);
  assert.equal(binary.json.code, "HWP_BINARY");
  assert.match(binary.json.hint, /HWPX/);

  assert.equal((await exec(["explode"])).json.code, "BAD_ARGS");
  assert.equal((await exec(["inspect", "--file", join(dir, "missing.hwpx")])).json.code, "FILE_NOT_FOUND");
  assert.equal((await exec(["fill", "--file", join(dir, "신청서.hwpx"), "--out", join(dir, "o.hwpx")])).json.code, "BAD_ARGS");
  cleanup();
});

test("a malformed plan is rejected before anything is written", async () => {
  const { dir, form, exec, cleanup } = setup();
  const planPath = join(dir, "plan.json");
  writeFileSync(planPath, "{ not json");
  const { code, json } = await exec(["fill", "--file", form, "--plan", planPath, "--out", join(dir, "o.hwpx")]);
  assert.equal(code, 2);
  assert.equal(json.code, "BAD_PLAN");
  cleanup();
});
