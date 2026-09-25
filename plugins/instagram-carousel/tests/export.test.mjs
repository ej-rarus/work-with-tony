import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProject } from "../scripts/lib/project.mjs";
import { ExportError, exportProject, pngDimensions, verifyProject } from "../scripts/lib/export.mjs";

const PLUGIN_ROOT = path.resolve(new URL("..", import.meta.url).pathname);

function candidate() {
  return {
    version: 1,
    meta: { brand: "일 잘하는 토니", handle: "@work.with.tony", series: "IT 기초", issue: "001", title: "MD 파일" },
    slides: [
      { id: "01", layout: "cover", title: "MD 파일", altText: "표지" },
      { id: "02", layout: "scene", title: "무엇일까", body: "텍스트 파일입니다.", altText: "설명" },
      { id: "03", layout: "compare", title: "쓰기와 읽기", before: "# 제목", after: "제목", altText: "비교" },
      { id: "04", layout: "checklist", title: "쓸 곳", items: ["회의록", "README"], altText: "목록" },
      { id: "05", layout: "close", title: "직접 열어보세요", altText: "마무리" }
    ],
    assets: [],
    caption: { body: "MD 파일을 알아봅니다.", hashtags: ["마크다운"] }
  };
}

function fakePng(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test("pngDimensions reads the IHDR dimensions and rejects non-PNG input", () => {
  assert.deepEqual(pngDimensions(fakePng(1080, 1350)), { width: 1080, height: 1350 });
  assert.throws(() => pngDimensions(Buffer.from("no")), ExportError);
});

test("verifyProject checks the trusted build report before export", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-verify-"));
  const projectDir = path.join(root, "project");
  await buildProject({ candidate: candidate(), outDir: projectDir, pluginRoot: PLUGIN_ROOT });
  const verified = await verifyProject(projectDir);
  assert.equal(verified.deck.slides.length, 5);
  assert.equal(verified.files.length, 7);

  await writeFile(path.join(projectDir, "carousel.js"), "tampered", "utf8");
  await assert.rejects(() => verifyProject(projectDir), /(hash|byte length) mismatch/i);
});

test("verifyProject rejects a symlinked intermediate assets directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-verify-link-"));
  const image = path.join(root, "source.png");
  await writeFile(image, fakePng(1, 1));
  const input = candidate();
  input.assets = [{ id: "tony", path: image, alt: "토니 캐릭터", fit: "contain", position: "bottom" }];
  input.slides[1].assetId = "tony";
  const projectDir = path.join(root, "project");
  await buildProject({ candidate: input, outDir: projectDir, pluginRoot: PLUGIN_ROOT });
  const builtDeck = JSON.parse(await readFile(path.join(projectDir, "deck.json"), "utf8"));
  const assetName = path.basename(builtDeck.assets[0].file);
  const outside = path.join(root, "outside-assets");
  await mkdir(outside);
  await writeFile(path.join(outside, assetName), await readFile(path.join(projectDir, "assets", assetName)));
  await rm(path.join(projectDir, "assets"), { recursive: true });
  await symlink(outside, path.join(projectDir, "assets"));
  await assert.rejects(() => verifyProject(projectDir), /symlink/i);
});

test("exportProject runs QA before every exact-size slide and creates a contact sheet atomically", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-export-"));
  const projectDir = path.join(root, "project");
  const browser = path.join(root, "fake-browser");
  await buildProject({ candidate: candidate(), outDir: projectDir, pluginRoot: PLUGIN_ROOT });
  await writeFile(browser, "fake", { mode: 0o700 });
  await chmod(browser, 0o700);
  const calls = [];

  const runBrowser = async ({ kind, output, width, height, url }) => {
    calls.push({ kind, output, width, height, url });
    if (kind === "dump") {
      const slide = new URL(url).searchParams.get("slide");
      return { stdout: `<output id="carousel-qa" data-ready="true" data-overflow="false" data-missing="false" data-slide="${slide}"></output>` };
    }
    await writeFile(output, fakePng(width, height));
    return { stdout: "" };
  };

  const result = await exportProject({ projectDir, browserPath: browser, runBrowser });
  assert.equal(result.slideCount, 5);
  const dumps = calls.filter((call) => call.kind === "dump");
  const screenshots = calls.filter((call) => call.kind === "screenshot");
  assert.equal(dumps.length, 5);
  assert.equal(screenshots.length, 6);
  assert.deepEqual(screenshots.slice(0, 5).map(({ width, height }) => [width, height]), Array(5).fill([1080, 1350]));

  const report = JSON.parse(await readFile(path.join(projectDir, "exports", "export-report.json"), "utf8"));
  assert.deepEqual(report.slides.map((slide) => slide.file), ["01.png", "02.png", "03.png", "04.png", "05.png"]);
  assert.equal(report.contactSheet.file, "carousel-contact-sheet.png");
  await assert.rejects(() => exportProject({ projectDir, browserPath: browser, runBrowser }), /exports.*exists/i);
});

test("exportProject stops before screenshots when browser QA reports overflow or missing assets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-qa-"));
  const projectDir = path.join(root, "project");
  const browser = path.join(root, "fake-browser");
  await buildProject({ candidate: candidate(), outDir: projectDir, pluginRoot: PLUGIN_ROOT });
  await writeFile(browser, "fake", { mode: 0o700 });
  await chmod(browser, 0o700);
  let screenshots = 0;
  const runBrowser = async ({ kind, output, width, height }) => {
    if (kind === "dump") return { stdout: '<output id="carousel-qa" data-ready="true" data-overflow="true" data-missing="false"></output>' };
    screenshots += 1;
    await writeFile(output, fakePng(width, height));
    return { stdout: "" };
  };
  await assert.rejects(() => exportProject({ projectDir, browserPath: browser, runBrowser }), /overflow/i);
  assert.equal(screenshots, 0);
});
