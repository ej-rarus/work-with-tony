import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "..", "..");
const read = (rel, base = root) => readFileSync(resolve(base, rel), "utf8");
const json = (rel, base = root) => JSON.parse(read(rel, base));

test("manifests agree and there are no runtime dependencies", () => {
  const claude = json(".claude-plugin/plugin.json");
  const codex = json(".codex-plugin/plugin.json");
  const pkg = json("package.json");
  assert.equal(claude.name, "hwp-form");
  assert.equal(codex.name, "hwp-form");
  assert.equal(claude.version, codex.version);
  assert.equal(pkg.version, claude.version);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(codex.skills, "./skills/");
});

test("both marketplaces register hwp-form at the manifest version", () => {
  const entry = json(".claude-plugin/marketplace.json", repo).plugins.find((p) => p.name === "hwp-form");
  assert.ok(entry);
  assert.equal(entry.source, "./plugins/hwp-form");
  assert.equal(entry.version, json(".claude-plugin/plugin.json").version);
  assert.ok(json(".agents/plugins/marketplace.json", repo).plugins.some((p) => p.name === "hwp-form" && p.source.path === "./plugins/hwp-form"));
});

test("fill skill wires the CLI, both invocations, and the references", () => {
  const skill = read("skills/fill/SKILL.md");
  assert.match(skill, /^---\nname: fill\ndescription: .+\n---\n/);
  for (const needle of ["/hwp-form:fill", "$hwp-form:fill", "CLAUDE_PLUGIN_ROOT", "scripts/hwp-form.mjs", "references/plan-format.md", "references/profile.md", "HWP_FORM_HOME", "HWP_BINARY", "HWPX"]) {
    assert.ok(skill.includes(needle), `SKILL.md missing ${needle}`);
  }
});

test("fill skill keeps signatures, consent and invention out, and confirms before writing", () => {
  const skill = read("skills/fill/SKILL.md");
  assert.match(skill, /Never fill a signature, seal, consent, or pledge/);
  assert.match(skill, /Never invent facts/);
  assert.match(skill, /Never overwrite or edit the original form/);
  assert.match(skill, /Do not write until the user confirms/);
  assert.match(skill, /untrusted data/);
  assert.match(skill, /Never write with hwp-mcp's cell tools/);
});

test("plan-format reference documents all ops and error codes the CLI emits", () => {
  const ref = read("skills/fill/references/plan-format.md");
  for (const needle of ['"set"', '"check"', '"find"', '"replace"', "CELL_NOT_FOUND", "CELL_HAS_OBJECTS", "CHECK_NOT_FOUND", "CHECK_AMBIGUOUS", "FIND_NOT_FOUND", "FIND_SPLIT", "FIND_AMBIGUOUS", "VERIFY_FAILED"]) {
    assert.ok(ref.includes(needle), `plan-format.md missing ${needle}`);
  }
});

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test("no personal data or real forms are committed in the plugin", () => {
  const banned = [/\d{6}-[1-4]\d{6}/, /478-04-03741/, /LUKUKU/i, /\/Users\//];
  for (const file of walk(root).filter((f) => !f.endsWith("package.test.mjs"))) {
    const text = readFileSync(file, "utf8");
    for (const re of banned) assert.ok(!re.test(text), `${re} found in ${file}`);
  }
  assert.ok(!walk(root).some((f) => /\.hwpx?$/i.test(f)), "no .hwp/.hwpx files in the plugin");
});

test("README covers install, the .hwp step, and the boundaries; root README lists the plugin", () => {
  const readme = read("README.md");
  for (const needle of ["/plugin install hwp-form@work-with-tony", "codex plugin add hwp-form@work-with-tony", "HWPX", "never modified", "signature"]) {
    assert.ok(readme.includes(needle), `README missing ${needle}`);
  }
  assert.match(read("README.md", repo), /hwp-form/);
});
