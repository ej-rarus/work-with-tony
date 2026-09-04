import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(pluginRoot, "..", "..");

export function readText(relPath, base = pluginRoot) {
  return readFileSync(resolve(base, relPath), "utf8");
}

export function readJson(relPath, base = pluginRoot) {
  return JSON.parse(readText(relPath, base));
}

export function makeTempHome() {
  const home = mkdtempSync(join(tmpdir(), "linkedin-post-test-"));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}
