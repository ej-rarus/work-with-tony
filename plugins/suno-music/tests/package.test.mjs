import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { pluginRoot, readJson, repoRoot } from "./helpers.mjs";

test("Codex manifest declares the Suno prepare skill", () => {
  const manifest = readJson(".codex-plugin/plugin.json");
  assert.equal(manifest.name, "suno-music");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.author.name, "Tony (Eunjae Lee)");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.interface.displayName, "Suno Music");
  assert.equal(manifest.interface.category, "Creative");
  assert.deepEqual(manifest.interface.capabilities, ["Interactive", "Browser"]);
  assert.ok(Array.isArray(manifest.interface.defaultPrompt));
});

test("repository marketplace lists existing and new plugins", () => {
  const marketplace = readJson(".agents/plugins/marketplace.json", repoRoot);
  assert.equal(marketplace.name, "work-with-tony");
  assert.equal(marketplace.interface.displayName, "Work With Tony");
  assert.deepEqual(marketplace.plugins.map((entry) => entry.name), ["linkedin-post", "suno-music"]);
  const suno = marketplace.plugins.find((entry) => entry.name === "suno-music");
  assert.equal(suno.source.path, "./plugins/suno-music");
  assert.deepEqual(suno.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
  assert.equal(suno.category, "Creative");
});

test("package has no executable integration or runtime dependency", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
  assert.equal(pkg.dependencies, undefined);
  assert.equal(existsSync(resolve(pluginRoot, ".mcp.json")), false);
  assert.equal(existsSync(resolve(pluginRoot, ".claude-plugin")), false);
});
