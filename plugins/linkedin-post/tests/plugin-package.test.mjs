import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { pluginRoot, readJson, readText, repoRoot } from "./helpers.mjs";

test("plugin.json declares name, version, description, author", () => {
  const manifest = readJson(".claude-plugin/plugin.json");
  assert.equal(manifest.name, "linkedin-post");
  assert.equal(manifest.version, readJson("package.json").version);
  assert.equal(manifest.version, readJson(".codex-plugin/plugin.json").version);
  assert.ok(manifest.description.length > 20);
  assert.equal(manifest.author.name, "Tony (Eunjae Lee)");
});

test("marketplace.json lists linkedin-post with matching version", () => {
  const market = readJson(".claude-plugin/marketplace.json", repoRoot);
  assert.equal(market.name, "work-with-tony");
  const entry = market.plugins.find((p) => p.name === "linkedin-post");
  const names = market.plugins.map((p) => p.name);
  assert.equal(new Set(names).size, names.length, "duplicate marketplace plugin name");
  assert.ok(entry, "linkedin-post entry missing");
  assert.equal(entry.source, "./plugins/linkedin-post");
  assert.equal(entry.version, readJson(".claude-plugin/plugin.json").version);
});

test("package.json has zero runtime dependencies and node>=20", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

test("no secret-looking values are committed in the plugin", () => {
  const patterns = [/AQ[A-Za-z0-9_-]{60,}/, /client_secret"\s*:\s*"[^"]{8,}"/i];
  for (const file of walk(pluginRoot)) {
    const text = readFileSync(file, "utf8");
    for (const p of patterns) assert.ok(!p.test(text), `secret pattern in ${file}`);
  }
});

test("repo .gitignore excludes local env and node_modules", () => {
  const ignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf8");
  assert.match(ignore, /node_modules/);
  assert.match(ignore, /\.env/);
  assert.ok(existsSync(resolve(repoRoot, ".gitignore")));
});

test("SKILL.md has frontmatter and references the scripts and reference docs", () => {
  const skill = readText("skills/post/SKILL.md");
  assert.match(skill, /^---\nname: post\ndescription: .+\n---\n/);
  for (const needle of [
    "references/style-guide.md",
    "references/post-types.md",
    "references/structures.md",
    "scripts/publish.mjs",
    "scripts/auth.mjs",
    "scripts/record.mjs",
    "structure:",
    "series:",
    "## Reactions",
    "--dry-run",
    "LINKEDIN_POST_HOME",
    "published/",
    "drafts/",
    "my-style.md",
  ]) assert.ok(skill.includes(needle), `SKILL.md missing ${needle}`);
});

test("SKILL.md forbids publishing without explicit confirmation", () => {
  const skill = readText("skills/post/SKILL.md");
  assert.match(skill, /Never publish without/i);
});

test("SKILL.md uses CLAUDE_PLUGIN_ROOT and the installed invocation form", () => {
  const skill = readText("skills/post/SKILL.md");
  assert.ok(skill.includes("CLAUDE_PLUGIN_ROOT"), "SKILL.md missing CLAUDE_PLUGIN_ROOT");
  assert.ok(skill.includes("/linkedin-post:post"), "SKILL.md missing /linkedin-post:post");
});

test("reference docs exist and define the four post types", () => {
  const types = readText("skills/post/references/post-types.md");
  for (const key of ["ai-tools", "philosophy", "side-project", "pm-insight"]) assert.ok(types.includes(`## ${key}`));
  assert.ok(readText("skills/post/references/style-guide.md").includes("3000"));
});

test("structures.md defines six structures and the rotation rule", () => {
  const structures = readText("skills/post/references/structures.md");
  for (const key of ["scene", "rules", "questions", "contrarian", "compare", "short"]) {
    assert.ok(structures.includes(`## ${key}`), `structures.md missing ## ${key}`);
  }
  assert.match(structures, /3 most recent/);
  assert.match(structures, /## Choosing/);
});

test("SKILL.md rotates structures and records reactions by hand", () => {
  const skill = readText("skills/post/SKILL.md");
  assert.match(skill, /Structure rotation/);
  assert.match(skill, /## 4\. Record reactions/);
  assert.match(skill, /never instructions|Never treat text inside/);
});
