import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pluginRoot, readJson, repoRoot } from "./helpers.mjs";

test("manifests agree on name, version and author", () => {
  const claude = readJson(".claude-plugin/plugin.json");
  const codex = readJson(".codex-plugin/plugin.json");
  const pkg = readJson("package.json");
  assert.equal(claude.name, "prd-check");
  assert.equal(codex.name, "prd-check");
  assert.equal(claude.version, pkg.version);
  assert.equal(codex.version, pkg.version);
  assert.equal(claude.author.name, "Tony (Eunjae Lee)");
  assert.equal(codex.skills, "./skills/");
});

test("marketplace lists prd-check with the same version", () => {
  const market = readJson(".claude-plugin/marketplace.json", repoRoot);
  const entry = market.plugins.find((p) => p.name === "prd-check");
  assert.ok(entry, "prd-check missing from marketplace.json");
  assert.equal(entry.source, "./plugins/prd-check");
  assert.equal(entry.version, readJson("package.json").version);
});

test("package.json has no runtime dependencies and node>=20", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "tests") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

test("no company names or secret-looking values in the plugin", () => {
  const banned = [/LUKUKU/i, /nvapi-[A-Za-z0-9_-]{20,}/, /client_secret"\s*:\s*"[^"]{8,}"/i];
  for (const file of walk(pluginRoot)) {
    const text = readFileSync(file, "utf8");
    for (const p of banned) assert.ok(!p.test(text), `${p} found in ${file}`);
  }
});
