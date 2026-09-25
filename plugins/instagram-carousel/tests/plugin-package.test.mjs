import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validateCandidateDeck } from "../scripts/lib/deck.mjs";

const PLUGIN_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const REPO_ROOT = path.resolve(PLUGIN_ROOT, "..", "..");

async function json(relative) {
  return JSON.parse(await readFile(path.join(PLUGIN_ROOT, relative), "utf8"));
}

test("Claude and Codex manifests declare the same v0.1 plugin", async () => {
  const codex = await json(".codex-plugin/plugin.json");
  const claude = await json(".claude-plugin/plugin.json");
  for (const manifest of [codex, claude]) {
    assert.equal(manifest.name, "instagram-carousel");
    assert.equal(manifest.version, "0.1.0");
    assert.match(manifest.description, /carousel/i);
    assert.equal(manifest.author.name, "Tony (Eunjae Lee)");
  }
  assert.equal(codex.interface.category, "Creative");
  assert.ok(codex.interface.defaultPrompt.length <= 3);
});

test("both repository catalogs register instagram-carousel exactly once", async () => {
  const codex = JSON.parse(await readFile(path.join(REPO_ROOT, ".agents", "plugins", "marketplace.json"), "utf8"));
  const claude = JSON.parse(await readFile(path.join(REPO_ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.equal(codex.plugins.filter((plugin) => plugin.name === "instagram-carousel").length, 1);
  assert.equal(claude.plugins.filter((plugin) => plugin.name === "instagram-carousel").length, 1);
  assert.equal(claude.plugins.find((plugin) => plugin.name === "instagram-carousel").version, "0.1.0");
});

test("package has no runtime dependencies and requires Node 20", async () => {
  const pkg = await json("package.json");
  assert.equal(pkg.version, "0.1.0");
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test("create skill routes plan-only and build modes without social posting", async () => {
  const skill = await readFile(path.join(PLUGIN_ROOT, "skills", "create", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: create\ndescription:/);
  assert.match(skill, /plan-only/i);
  assert.match(skill, /build/i);
  assert.match(skill, /never post|do not post/i);
  assert.match(skill, /carousel\.mjs inspect/);
  assert.match(skill, /carousel\.mjs export/);
  assert.match(skill, /deck-format\.md/);
});

test("sample deck is valid and exercises all seven layouts", async () => {
  const sample = validateCandidateDeck(await json("examples/md-basics.deck.json"));
  assert.deepEqual(sample.slides.map((slide) => slide.layout), ["cover", "scene", "compare", "checklist", "prompt", "statement", "close"]);
  assert.equal(sample.assets.length, 0);
});

test("Hallmark stamp, tokens, and project memory are committed with the visual system", async () => {
  const css = await readFile(path.join(PLUGIN_ROOT, "assets", "carousel.css"), "utf8");
  const tokens = await readFile(path.join(PLUGIN_ROOT, "assets", "tokens.css"), "utf8");
  const log = await json(".hallmark/log.json");
  assert.match(css.split("\n")[0], /Hallmark · macrostructure: Component Playground/);
  assert.match(tokens, /--color-accent:/);
  assert.equal(log[0].macrostructure, "Component Playground");
});

test("README documents editable source, PNG export, safety boundaries, and installs", async () => {
  const readme = await readFile(path.join(PLUGIN_ROOT, "README.md"), "utf8");
  for (const phrase of ["deck.json", "1080×1350", "Claude Code", "Codex", "does not post", "Chrome"]) assert.ok(readme.includes(phrase), phrase);
  const rootReadme = await readFile(path.join(REPO_ROOT, "README.md"), "utf8");
  assert.match(rootReadme, /instagram-carousel/);
});
