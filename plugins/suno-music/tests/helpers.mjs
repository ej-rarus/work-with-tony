import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(pluginRoot, "..", "..");

export function readText(relativePath, base = pluginRoot) {
  return readFileSync(resolve(base, relativePath), "utf8");
}

export function readJson(relativePath, base = pluginRoot) {
  return JSON.parse(readText(relativePath, base));
}
