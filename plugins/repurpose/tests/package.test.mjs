import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(root, "..", "..");
const read = (rel, base = root) => readFileSync(resolve(base, rel), "utf8");
const json = (rel, base = root) => JSON.parse(read(rel, base));

test("manifests agree on name and version", () => {
  const claude = json(".claude-plugin/plugin.json");
  const codex = json(".codex-plugin/plugin.json");
  const pkg = json("package.json");
  assert.equal(claude.name, "repurpose");
  assert.equal(codex.name, "repurpose");
  assert.equal(claude.version, codex.version);
  assert.equal(pkg.version, claude.version);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(codex.skills, "./skills/");
});

test("both marketplaces register repurpose at the manifest version", () => {
  const claudeMarket = json(".claude-plugin/marketplace.json", repo);
  const entry = claudeMarket.plugins.find((p) => p.name === "repurpose");
  assert.ok(entry, "missing from .claude-plugin/marketplace.json");
  assert.equal(entry.source, "./plugins/repurpose");
  assert.equal(entry.version, json(".claude-plugin/plugin.json").version);
  const codexMarket = json(".agents/plugins/marketplace.json", repo);
  assert.ok(codexMarket.plugins.some((p) => p.name === "repurpose" && p.source.path === "./plugins/repurpose"));
});

test("make skill has frontmatter and both invocation forms", () => {
  const skill = read("skills/make/SKILL.md");
  assert.match(skill, /^---\nname: make\ndescription: .+\n---\n/);
  assert.ok(skill.includes("/repurpose:make"));
  assert.ok(skill.includes("$repurpose:make"));
});

test("make skill confirms the core sheet before drafting and saves a brief", () => {
  const skill = read("skills/make/SKILL.md");
  assert.ok(skill.includes("references/core-sheet.md"));
  assert.match(skill, /REPURPOSE_HOME/);
  assert.ok(skill.includes("briefs/"));
  assert.match(skill, /Do not draft any channel until the user confirms the core sheet/);
});

test("make skill hands off to the channel plugins instead of publishing", () => {
  const skill = read("skills/make/SKILL.md");
  for (const needle of ["linkedin-post:post", "instagram-carousel:create", "plan-only", "linkedin-post@work-with-tony", "instagram-carousel@work-with-tony"]) {
    assert.ok(skill.includes(needle), `SKILL.md missing ${needle}`);
  }
  assert.match(skill, /never publish/i);
  assert.match(skill, /untrusted/i);
});

test("core sheet reference defines the fields and the no-new-facts rule", () => {
  const sheet = read("skills/make/references/core-sheet.md");
  for (const field of ["claim:", "audience:", "supports:", "example:", "check:", "linkedin_angle:", "carousel_angle:"]) {
    assert.ok(sheet.includes(field), `core-sheet.md missing ${field}`);
  }
  assert.match(sheet, /확인 필요/);
  assert.match(sheet, /never invent/i);
});

test("README covers install, flow and the publishing boundary; root README lists it", () => {
  const readme = read("README.md");
  for (const needle of ["/plugin install repurpose@work-with-tony", "codex plugin add repurpose@work-with-tony", "does not publish"]) {
    assert.ok(readme.includes(needle), `README missing ${needle}`);
  }
  assert.match(read("README.md", repo), /repurpose/);
});
