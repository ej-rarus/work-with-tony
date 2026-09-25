#!/usr/bin/env node
import path from "node:path";

import { resolveCandidateDeck, validateCandidateDeck, validateCanonicalDeck } from "./lib/deck.mjs";
import { exportProject } from "./lib/export.mjs";
import { inspectSource, readJsonFile } from "./lib/input.mjs";
import { buildProject } from "./lib/project.mjs";

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

const USAGE = "Usage: carousel.mjs inspect --file PATH [--json] | validate --deck PATH [--json] | build --deck PATH --out NEW_DIRECTORY [--json] | export --project PROJECT_DIRECTORY [--browser EXECUTABLE] [--json]";

function parse(argv) {
  const command = argv[0];
  const rules = {
    inspect: { values: new Set(["--file"]), required: new Set(["--file"]) },
    validate: { values: new Set(["--deck"]), required: new Set(["--deck"]) },
    build: { values: new Set(["--deck", "--out"]), required: new Set(["--deck", "--out"]) },
    export: { values: new Set(["--project", "--browser"]), required: new Set(["--project"]) }
  };
  if (!rules[command]) throw new UsageError("Choose inspect, validate, build, or export.");
  const options = { command, json: false };
  const seen = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--json") {
      if (seen.has(flag)) throw new UsageError("--json cannot be repeated.");
      seen.add(flag);
      options.json = true;
      continue;
    }
    if (!rules[command].values.has(flag)) throw new UsageError(`Unknown option for ${command}: ${flag}.`);
    if (seen.has(flag)) throw new UsageError(`${flag} cannot be repeated.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new UsageError(`${flag} needs a value.`);
    seen.add(flag);
    options[flag.slice(2)] = value;
    index += 1;
  }
  for (const required of rules[command].required) {
    if (!seen.has(required)) throw new UsageError(`${required} is required for ${command}.`);
  }
  return options;
}

function output(value, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  for (const [key, item] of Object.entries(value)) process.stdout.write(`${key}: ${Array.isArray(item) ? item.join(", ") : item}\n`);
}

function editableCandidate(raw, deckPath) {
  const hasCanonicalAssets = Array.isArray(raw?.assets) && raw.assets.some((asset) => asset && typeof asset === "object" && Object.hasOwn(asset, "file"));
  if (!hasCanonicalAssets) return validateCandidateDeck(raw);
  const canonical = validateCanonicalDeck(raw);
  return {
    ...canonical,
    assets: canonical.assets.map((asset) => ({
      id: asset.id,
      path: path.resolve(path.dirname(deckPath), asset.file),
      alt: asset.alt,
      fit: asset.fit,
      position: asset.position
    }))
  };
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.command === "inspect") {
    output(await inspectSource(options.file), options.json);
    return;
  }
  if (options.command === "validate") {
    const raw = await readJsonFile(options.deck);
    const { canonicalDeck } = await resolveCandidateDeck(editableCandidate(raw, options.deck));
    output({ valid: true, slides: canonicalDeck.slides.length, assets: canonicalDeck.assets.length, layouts: canonicalDeck.slides.map((slide) => slide.layout) }, options.json);
    return;
  }
  if (options.command === "build") {
    const candidate = editableCandidate(await readJsonFile(options.deck), options.deck);
    output(await buildProject({ candidate, outDir: options.out }), options.json);
    return;
  }
  output(await exportProject({ projectDir: options.project, browserPath: options.browser }), options.json);
}

main().catch((error) => {
  const usage = error instanceof UsageError;
  const json = process.argv.includes("--json");
  const body = { ok: false, code: error.code || (usage ? "USAGE" : "ERROR"), error: error.message };
  if (json) process.stderr.write(`${JSON.stringify(body)}\n`);
  else process.stderr.write(`${error.message}\n${usage ? `${USAGE}\n` : ""}`);
  process.exitCode = usage ? 2 : 1;
});
