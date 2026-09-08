import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { pluginRoot, readJson, readText, repoRoot } from "./helpers.mjs";

test("Codex manifest declares the Suno prepare skill", () => {
  const manifest = readJson(".codex-plugin/plugin.json");
  assert.equal(manifest.name, "suno-music");
  assert.equal(manifest.version, readJson("package.json").version);
  assert.equal(manifest.author.name, "Tony (Eunjae Lee)");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.interface.displayName, "Suno Music");
  assert.equal(manifest.interface.category, "Creative");
  assert.deepEqual(manifest.interface.capabilities, ["Interactive", "Browser"]);
  assert.ok(Array.isArray(manifest.interface.defaultPrompt));
});

test("Claude manifest declares the Suno prepare plugin", () => {
  const manifest = readJson(".claude-plugin/plugin.json");
  assert.equal(manifest.name, "suno-music");
  assert.equal(manifest.version, readJson("package.json").version);
  assert.equal(manifest.version, readJson(".codex-plugin/plugin.json").version);
  assert.equal(manifest.author.name, "Tony (Eunjae Lee)");
});

test("repository marketplace lists existing and new plugins", () => {
  const marketplace = readJson(".agents/plugins/marketplace.json", repoRoot);
  assert.equal(marketplace.name, "work-with-tony");
  assert.equal(marketplace.interface.displayName, "Work With Tony");
  const names = marketplace.plugins.map((entry) => entry.name);
  for (const name of ["linkedin-post", "suno-music"]) assert.ok(names.includes(name), `${name} entry missing`);
  assert.equal(new Set(names).size, names.length, "duplicate marketplace plugin name");
  const suno = marketplace.plugins.find((entry) => entry.name === "suno-music");
  assert.equal(suno.source.path, "./plugins/suno-music");
  assert.deepEqual(suno.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
  assert.equal(suno.category, "Creative");
});

test("Claude marketplace lists both plugins with the Suno manifest version", () => {
  const marketplace = readJson(".claude-plugin/marketplace.json", repoRoot);
  const names = marketplace.plugins.map((entry) => entry.name);
  for (const name of ["linkedin-post", "suno-music"]) assert.ok(names.includes(name), `${name} entry missing`);
  assert.equal(new Set(names).size, names.length, "duplicate marketplace plugin name");
  const suno = marketplace.plugins.find((entry) => entry.name === "suno-music");
  assert.equal(suno.source, "./plugins/suno-music");
  assert.equal(suno.version, readJson(".claude-plugin/plugin.json").version);
});

test("package has no executable integration or runtime dependency", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
  assert.equal(pkg.dependencies, undefined);
  assert.equal(existsSync(resolve(pluginRoot, ".mcp.json")), false);
  assert.equal(existsSync(resolve(pluginRoot, ".claude-plugin/plugin.json")), true);
});

test("prepare skill defines the semantic Suno form workflow", () => {
  const skill = readText("skills/prepare/SKILL.md");
  assert.match(skill, /^---\nname: prepare\ndescription: .+\n---\n/);
  for (const required of [
    "https://suno.com/create",
    "Advanced",
    "Lyrics editor",
    "Styles",
    "Song Title (Optional)",
    "Male",
    "Female",
    "5,000",
    "1,000",
  ]) assert.ok(skill.includes(required), `prepare skill missing ${required}`);
});

test("prepare skill preserves user text and forbids credit-spending actions", () => {
  const skill = readText("skills/prepare/SKILL.md");
  assert.match(skill, /preserve.*exactly/i);
  assert.match(skill, /Never click, press, or otherwise invoke `Create song`/);
  assert.match(skill, /existing form.*confirmation/i);
  assert.match(skill, /fresh browser state/i);
  assert.match(skill, /fixed coordinates/i);
  assert.doesNotMatch(skill, /click\([^\n]*Create song/i);
});

test("documentation describes prepare-only scope and Claude and Codex installation", () => {
  const pluginReadme = readText("README.md");
  const rootReadme = readText("README.md", repoRoot);
  assert.ok(pluginReadme.includes("$suno-music:prepare"));
  assert.ok(pluginReadme.includes("Create song"));
  assert.ok(pluginReadme.includes("does not"));
  assert.ok(pluginReadme.includes("/suno-music:prepare"));
  assert.ok(rootReadme.includes("/plugin install suno-music@work-with-tony"));
  assert.ok(rootReadme.includes("codex plugin marketplace add ej-rarus/work-with-tony"));
  assert.ok(rootReadme.includes("suno-music@work-with-tony"));
});
