import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { validateCandidateDeck, validateCanonicalDeck } from "../scripts/lib/deck.mjs";

const exec = promisify(execFile);
const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = path.join(PLUGIN_ROOT, "scripts", "carousel.mjs");
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function deck() {
  return {
    version: 1,
    meta: { brand: "일 잘하는 토니", handle: "@work.with.tony", series: "IT 기초", issue: "001", title: "MD 파일이란?" },
    slides: [
      { id: "01", layout: "cover", title: "낯선 .md 파일을 만났다면", altText: "마크다운 파일 소개 표지" },
      { id: "02", layout: "scene", title: "글자와 기호로 쓴 문서", altText: "마크다운 설명" },
      { id: "03", layout: "compare", title: "기호가 제목이 됩니다", before: "# 회의 정리", after: "회의 정리", altText: "원문과 표시 결과" },
      { id: "04", layout: "prompt", title: "AI에게 물어보세요", prompt: "이 파일의 구조를 설명해 줘.", altText: "파일을 읽는 연습" },
      { id: "05", layout: "close", title: "문서를 열어보세요", altText: "실습을 안내하는 마무리" }
    ],
    assets: [],
    caption: { body: "PM을 위한 마크다운 기초", hashtags: ["PM", "Markdown"] }
  };
}

function editorial() {
  return { ...deck(), template: "editorial-blue" };
}

function candidateWithCoverAsset() {
  const candidate = editorial();
  candidate.assets = [{ id: "paper", path: "/tmp/paper.png", alt: "파란 배경 위에 접힌 종이" }];
  candidate.slides[0].assetId = "paper";
  return candidate;
}

test("editorial opt-in survives normalization even without a cover image", () => {
  const normalized = validateCandidateDeck(editorial());
  assert.equal(normalized.template, "editorial-blue");
  assert.equal(Object.hasOwn(normalized.slides[0], "assetId"), false);
  assert.equal(validateCanonicalDeck(normalized).template, "editorial-blue");
});

test("omitting template preserves the legacy candidate and canonical shape", () => {
  const candidate = validateCandidateDeck(deck());
  assert.equal(Object.hasOwn(candidate, "template"), false);
  const canonical = validateCanonicalDeck(candidate);
  assert.equal(Object.hasOwn(canonical, "template"), false);
  assert.deepEqual(canonical.slides[0], {
    id: "01", layout: "cover", title: "낯선 .md 파일을 만났다면", altText: "마크다운 파일 소개 표지"
  });
});

test("editorial cover can refer to a declared candidate asset", () => {
  const normalized = validateCandidateDeck(candidateWithCoverAsset());
  assert.equal(normalized.slides[0].assetId, "paper");
  assert.deepEqual(normalized.assets[0], {
    id: "paper", path: "/tmp/paper.png", alt: "파란 배경 위에 접힌 종이", fit: "cover", position: "center"
  });
});

test("editorial cover references must resolve to a declared asset", () => {
  const candidate = editorial();
  candidate.slides[0].assetId = "missing";
  assert.throws(() => validateCandidateDeck(candidate), /references missing asset: missing/);
});

test("editorial cover asset identifiers retain the existing nonempty string limits", () => {
  for (const assetId of ["", " ", null, 42, "a".repeat(41)]) {
    const candidate = candidateWithCoverAsset();
    candidate.slides[0].assetId = assetId;
    assert.throws(() => validateCandidateDeck(candidate), /slides\[0\]\.assetId/, String(assetId));
  }
});

test("legacy cover assets remain rejected without explicit editorial opt-in", () => {
  const candidate = candidateWithCoverAsset();
  delete candidate.template;
  assert.throws(() => validateCandidateDeck(candidate), /cover.*asset/i);
});

test("unsupported explicit template values cannot select a renderer", () => {
  for (const template of ["default", "Editorial-blue", "editorial-blue ", "", null, undefined, 1, {}, ["editorial-blue"]]) {
    assert.throws(() => validateCandidateDeck({ ...deck(), template }), /template/, String(template));
    assert.throws(() => validateCanonicalDeck({ ...deck(), template }), /template/, String(template));
  }
});

test("editorial opt-in keeps root and slide unknown-field validation strict", () => {
  assert.throws(() => validateCandidateDeck({ ...editorial(), css: "body{}" }), /unknown field: css/);
  const candidate = editorial();
  candidate.slides[0].html = "<script>alert(1)</script>";
  assert.throws(() => validateCandidateDeck(candidate), /unknown field: html/);
});

test("cover asset support does not broaden other layout fields", () => {
  const candidate = candidateWithCoverAsset();
  candidate.slides[2].assetId = "paper";
  assert.throws(() => validateCandidateDeck(candidate), /unknown field: assetId/);
});

test("editorial canonical assets still reject source paths and unsafe file references", () => {
  const canonical = editorial();
  canonical.slides[0].assetId = "paper";
  canonical.assets = [{
    id: "paper", file: "assets/0000000000000000.png", alt: "종이", fit: "cover", position: "center",
    mediaType: "image/png", sha256: "0".repeat(64), originalName: "paper.png"
  }];
  const accepted = validateCanonicalDeck(canonical);
  assert.equal(accepted.slides[0].assetId, "paper");
  assert.equal(accepted.template, "editorial-blue");
  canonical.assets[0].path = "/private/source.png";
  assert.throws(() => validateCanonicalDeck(canonical), /unknown field: path/);
  delete canonical.assets[0].path;
  canonical.assets[0].file = "../private/source.png";
  assert.throws(() => validateCanonicalDeck(canonical), /file is not canonical/);
});

test("building and rebuilding an editorial deck preserves cover metadata and copied image bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-editorial-rebuild-"));
  const image = path.join(root, "paper.png");
  const inputPath = path.join(root, "input.json");
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  const candidate = candidateWithCoverAsset();
  candidate.assets[0].path = image;
  await writeFile(image, PNG_1X1);
  await writeFile(inputPath, JSON.stringify(candidate));

  await exec(process.execPath, [CLI, "build", "--deck", inputPath, "--out", first, "--json"]);
  await exec(process.execPath, [CLI, "build", "--deck", path.join(first, "deck.json"), "--out", second, "--json"]);

  for (const output of [first, second]) {
    const built = JSON.parse(await readFile(path.join(output, "deck.json"), "utf8"));
    assert.equal(built.template, "editorial-blue");
    assert.equal(built.slides[0].assetId, "paper");
    assert.equal(built.assets[0].originalName.endsWith(".png"), true);
    assert.equal(JSON.stringify(built).includes(image), false);
    assert.equal(Object.hasOwn(built.assets[0], "path"), false);
    assert.deepEqual(await readFile(path.join(output, built.assets[0].file)), PNG_1X1);
  }
});
