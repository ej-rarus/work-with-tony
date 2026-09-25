import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCandidateDeck } from "./deck.mjs";
import { renderAltText, renderCaption, renderHtml } from "./render.mjs";

const DEFAULT_PLUGIN_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export class ProjectError extends Error {
  constructor(message, code = "PROJECT_ERROR") {
    super(message);
    this.name = "ProjectError";
    this.code = code;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function secureOutputPath(outDir, pluginRoot) {
  if (typeof outDir !== "string" || outDir.length === 0) throw new ProjectError("Output path must be a non-empty string.");
  const output = path.resolve(outDir);
  if (await exists(output)) throw new ProjectError(`Output already exists: ${output}`, "OUTPUT_EXISTS");
  const parent = path.dirname(output);
  let parentStat;
  try {
    parentStat = await lstat(parent);
  } catch {
    throw new ProjectError(`Output parent does not exist: ${parent}`, "MISSING_PARENT");
  }
  if (!parentStat.isDirectory()) throw new ProjectError("Output parent must be a directory.");
  const [actualParent, actualPlugin] = await Promise.all([realpath(parent), realpath(pluginRoot)]);
  const actualOutput = path.join(actualParent, path.basename(output));
  if (isInside(actualOutput, actualPlugin)) throw new ProjectError("Output cannot be created inside the installed plugin tree.", "PLUGIN_OUTPUT");
  return { output, parent };
}

async function writePrivate(filePath, content) {
  await writeFile(filePath, content, { mode: 0o600, flag: "wx" });
  await chmod(filePath, 0o600);
}

async function trustedEntry(root, relativePath) {
  const bytes = await readFile(path.join(root, relativePath));
  return { path: relativePath, sha256: sha256(bytes), bytes: bytes.length };
}

export async function buildProject({ candidate, outDir, pluginRoot = DEFAULT_PLUGIN_ROOT }) {
  const { output, parent } = await secureOutputPath(outDir, pluginRoot);
  const { canonicalDeck, resolvedAssets } = await resolveCandidateDeck(candidate);
  const stage = path.join(parent, `.${path.basename(output)}.stage-${process.pid}-${randomUUID()}`);
  let stageExists = false;
  try {
    await mkdir(stage, { mode: 0o700 });
    stageExists = true;
    await chmod(stage, 0o700);

    const templates = await Promise.all(["carousel.js", "tokens.css", "carousel.css"].map((name) => readFile(path.join(pluginRoot, "assets", name))));
    const generated = new Map([
      ["deck.json", `${JSON.stringify(canonicalDeck, null, 2)}\n`],
      ["carousel.html", renderHtml(canonicalDeck)],
      ["carousel.js", templates[0]],
      ["tokens.css", templates[1]],
      ["carousel.css", templates[2]],
      ["caption.md", renderCaption(canonicalDeck)],
      ["alt-text.md", renderAltText(canonicalDeck)]
    ]);

    for (const [relative, content] of generated) await writePrivate(path.join(stage, relative), content);

    if (resolvedAssets.length > 0) {
      const assetDir = path.join(stage, "assets");
      await mkdir(assetDir, { mode: 0o700 });
      await chmod(assetDir, 0o700);
      const written = new Set();
      for (const asset of canonicalDeck.assets) {
        if (written.has(asset.file)) continue;
        const resolved = resolvedAssets.find((item) => item.id === asset.id);
        if (!resolved || sha256(resolved.bytes) !== asset.sha256) throw new ProjectError(`Asset changed during build: ${asset.originalName}.`, "ASSET_CHANGED");
        await writePrivate(path.join(stage, asset.file), resolved.bytes);
        written.add(asset.file);
      }
    }

    const trustedPaths = [...generated.keys(), ...new Set(canonicalDeck.assets.map((asset) => asset.file))].sort();
    const files = await Promise.all(trustedPaths.map((relative) => trustedEntry(stage, relative)));
    const report = {
      version: 1,
      plugin: { name: "instagram-carousel", version: "0.1.0" },
      createdAt: new Date().toISOString(),
      files,
      copiedAssets: canonicalDeck.assets.map((asset) => ({ originalName: asset.originalName, output: asset.file, sha256: asset.sha256 }))
    };
    await writePrivate(path.join(stage, "build-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    await rename(stage, output);
    stageExists = false;
    return { projectDir: output, slideCount: canonicalDeck.slides.length, assetCount: canonicalDeck.assets.length };
  } catch (error) {
    if (stageExists) await rm(stage, { recursive: true, force: true });
    if (error instanceof ProjectError) throw error;
    throw new ProjectError(error.message, error.code || "PROJECT_ERROR");
  }
}
