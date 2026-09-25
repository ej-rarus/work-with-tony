import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveBrowser, runChrome } from "./browser.mjs";
import { validateCanonicalDeck } from "./deck.mjs";
import { readJsonFile } from "./input.mjs";

export class ExportError extends Error {
  constructor(message, code = "EXPORT_ERROR") {
    super(message);
    this.name = "ExportError";
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

function inside(relative) {
  return relative !== "" && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !relative.split(/[\\/]/).includes("..");
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

async function rejectSymlinkedParents(root, relativePath) {
  const segments = relativePath.split(/[\\/]/);
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new ExportError(`Trusted path has a symlinked parent: ${relativePath}.`);
    if (!stat.isDirectory()) throw new ExportError(`Trusted path parent is not a directory: ${relativePath}.`);
  }
}

export function pngDimensions(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new ExportError("Screenshot is not a valid PNG with an IHDR header.", "INVALID_PNG");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export async function verifyProject(projectDir) {
  const root = path.resolve(projectDir);
  let stat;
  try {
    stat = await lstat(root);
  } catch {
    throw new ExportError(`Project directory was not found: ${root}`, "PROJECT_NOT_FOUND");
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new ExportError("Project must be a regular directory, not a symlink.");
  const report = await readJsonFile(path.join(root, "build-report.json"));
  if (!plainObject(report) || report.version !== 1 || !Array.isArray(report.files)) throw new ExportError("build-report.json has an invalid shape.");
  const deck = validateCanonicalDeck(await readJsonFile(path.join(root, "deck.json")));
  const required = new Set(["deck.json", "carousel.html", "carousel.js", "tokens.css", "carousel.css", "caption.md", "alt-text.md", ...deck.assets.map((asset) => asset.file)]);
  const seen = new Set();
  for (const entry of report.files) {
    if (!plainObject(entry) || typeof entry.path !== "string" || !inside(entry.path) || typeof entry.sha256 !== "string" || typeof entry.bytes !== "number") {
      throw new ExportError("build-report.json contains an invalid file entry.");
    }
    if (seen.has(entry.path)) throw new ExportError(`build-report.json contains duplicate path: ${entry.path}.`);
    seen.add(entry.path);
    if (!required.has(entry.path)) throw new ExportError(`build-report.json contains an unexpected trusted file: ${entry.path}.`);
    const filePath = path.join(root, entry.path);
    await rejectSymlinkedParents(root, entry.path);
    const fileStat = await lstat(filePath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new ExportError(`Trusted file is not a regular file: ${entry.path}.`);
    const bytes = await readFile(filePath);
    if (bytes.length !== entry.bytes) throw new ExportError(`Byte length mismatch for ${entry.path}.`);
    if (sha256(bytes) !== entry.sha256) throw new ExportError(`Hash mismatch for ${entry.path}.`);
  }
  if (required.size !== seen.size || [...required].some((file) => !seen.has(file))) throw new ExportError("build-report.json does not cover every required project file.");
  return { root, deck, report, files: report.files };
}

function qaFromDom(html, slideId) {
  const match = html.match(/<output\b[^>]*\bid="carousel-qa"[^>]*>/i) || html.match(/<output\b[^>]*\bdata-ready="true"[^>]*>/i);
  if (!match) throw new ExportError(`Slide ${slideId} did not produce a QA marker.`, "QA_NOT_READY");
  const tag = match[0];
  if (!/\bdata-ready="true"/i.test(tag)) throw new ExportError(`Slide ${slideId} was not ready.`, "QA_NOT_READY");
  if (/\bdata-missing="true"/i.test(tag)) throw new ExportError(`Slide ${slideId} has a missing asset.`, "QA_MISSING_ASSET");
  if (/\bdata-overflow="true"/i.test(tag)) {
    const detail = tag.match(/\bdata-overflow-detail="([^"]*)"/i)?.[1];
    throw new ExportError(`Slide ${slideId} has text overflow${detail ? ` (${detail})` : ""}.`, "QA_OVERFLOW");
  }
}

function slideUrl(projectRoot, slideId) {
  const url = pathToFileURL(path.join(projectRoot, "carousel.html"));
  url.searchParams.set("slide", slideId);
  url.searchParams.set("export", "1");
  return url.href;
}

function contactSheetHtml(slides, height) {
  const figures = slides.map((slide) => `<figure><img src="./${slide.file}" width="480" height="600" alt=""><figcaption>${slide.id}</figcaption></figure>`).join("");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=1240, initial-scale=1">
<style>
:root{--paper:oklch(90% .038 248);--ink:oklch(20% .032 254);--surface:oklch(98% .009 248);--accent:oklch(54% .205 257);--accent-ink:oklch(98% .009 248);--font-display:"Apple SD Gothic Neo","Noto Sans KR",sans-serif;--font-mono:"SFMono-Regular","Menlo",monospace;--space-xs:8px;--space-sm:12px;--space-xl:40px;--space-sheet-title:48px;--space-sheet-x:120px;--space-sheet-y:72px}
*{box-sizing:border-box}html,body{margin:0;width:1240px;min-height:${height}px;background:var(--paper);color:var(--ink);font-family:var(--font-display)}body{padding:var(--space-sheet-y) var(--space-sheet-x)}header{margin:0 0 var(--space-sheet-title);display:flex;align-items:flex-end;justify-content:space-between;border-left:10px solid var(--accent);padding-left:20px}h1{margin:0;font-size:42px;font-style:normal;font-weight:800;line-height:1;letter-spacing:-.055em}header span{font:16px var(--font-mono)}main{display:grid;grid-template-columns:480px 480px;gap:var(--space-xl)}figure{margin:0;position:relative;width:480px;height:600px;overflow:hidden;background:var(--surface)}img{display:block;width:480px;height:600px}figcaption{position:absolute;right:0;bottom:0;padding:var(--space-xs) var(--space-sm);background:var(--accent);color:var(--accent-ink);font:18px var(--font-mono)}
</style></head><body><header><h1>일 잘하는 토니</h1><span>carousel preview</span></header><main>${figures}</main></body></html>`;
}

async function screenshotAndMeasure(run, options, expectedWidth, expectedHeight) {
  await run({ kind: "screenshot", ...options, width: expectedWidth, height: expectedHeight });
  const bytes = await readFile(options.output);
  const dimensions = pngDimensions(bytes);
  if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new ExportError(`Screenshot dimensions are ${dimensions.width}x${dimensions.height}; expected ${expectedWidth}x${expectedHeight}.`, "WRONG_DIMENSIONS");
  }
  await chmod(options.output, 0o600);
  return { bytes, dimensions };
}

export async function exportProject({ projectDir, browserPath, runBrowser = runChrome }) {
  const verified = await verifyProject(projectDir);
  const exportsDir = path.join(verified.root, "exports");
  if (await exists(exportsDir)) throw new ExportError("exports directory already exists; create a new project to export again.", "EXPORTS_EXIST");
  const browser = await resolveBrowser(browserPath);
  const stage = path.join(verified.root, `.exports-stage-${process.pid}-${randomUUID()}`);
  let stageExists = false;
  try {
    await mkdir(stage, { mode: 0o700 });
    stageExists = true;
    await chmod(stage, 0o700);
    const slides = [];
    for (const slide of verified.deck.slides) {
      const url = slideUrl(verified.root, slide.id);
      const dump = await runBrowser({ browserPath: browser, kind: "dump", url, width: 1080, height: 1350 });
      qaFromDom(dump.stdout, slide.id);
      const file = `${slide.id}.png`;
      const output = path.join(stage, file);
      const capture = await screenshotAndMeasure(runBrowser, { browserPath: browser, url, output }, 1080, 1350);
      slides.push({ id: slide.id, file, width: 1080, height: 1350, bytes: capture.bytes.length, sha256: sha256(capture.bytes) });
    }

    const rows = Math.ceil(slides.length / 2);
    const contactWidth = 1240;
    const contactHeight = 168 + rows * 640;
    const contactHtml = path.join(stage, ".contact-sheet.html");
    await writeFile(contactHtml, contactSheetHtml(slides, contactHeight), { mode: 0o600, flag: "wx" });
    const contactOutput = path.join(stage, "carousel-contact-sheet.png");
    const contactUrl = pathToFileURL(contactHtml).href;
    const contact = await screenshotAndMeasure(runBrowser, { browserPath: browser, url: contactUrl, output: contactOutput }, contactWidth, contactHeight);
    await unlink(contactHtml);

    const report = {
      version: 1,
      createdAt: new Date().toISOString(),
      browser,
      slides,
      contactSheet: { file: "carousel-contact-sheet.png", width: contactWidth, height: contactHeight, bytes: contact.bytes.length, sha256: sha256(contact.bytes) }
    };
    await writeFile(path.join(stage, "export-report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await chmod(path.join(stage, "export-report.json"), 0o600);
    await rename(stage, exportsDir);
    stageExists = false;
    return { exportsDir, slideCount: slides.length, contactSheet: path.join(exportsDir, "carousel-contact-sheet.png"), browser };
  } catch (error) {
    if (stageExists) await rm(stage, { recursive: true, force: true });
    if (error instanceof ExportError) throw error;
    throw new ExportError(error.message, error.code || "EXPORT_ERROR");
  }
}
