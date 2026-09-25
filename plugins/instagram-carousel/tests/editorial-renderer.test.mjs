import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { resolveBrowser, runChrome } from "../scripts/lib/browser.mjs";
import { renderHtml } from "../scripts/lib/render.mjs";

const plugin = fileURLToPath(new URL("../", import.meta.url));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("editorial checklist preserves authored line breaks between explanations and examples", async () => {
  const css = await readFile(path.join(plugin, "assets", "carousel.css"), "utf8");
  assert.match(css, /\.template--editorial-blue\s+\.checklist__text\s*\{[^}]*white-space:\s*pre-wrap/);
});

// Catches missing photo layers, baked-in topic copy, unsafe text rendering,
// and a layout that exports clipped text, using the actual browser renderer.
test("editorial renderer keeps the photo separate from editable copy across reusable layouts", async (t) => {
  let browser;
  try { browser = await resolveBrowser(); } catch { return t.skip("Chrome/Chromium not installed"); }
  const root = await mkdtemp(path.join(tmpdir(), "editorial-renderer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all(["carousel.css", "tokens.css", "carousel.js"].map((file) => copyFile(path.join(plugin, "assets", file), path.join(root, file))));
  await writeFile(path.join(root, "photo.png"), png);
  const deck = {
    version: 1, template: "editorial-blue",
    meta: { brand: "테스트 브랜드", handle: "@example", series: "파일 기초", issue: "002", title: "HTML 문서" },
    assets: [{ id: "photo", file: "photo.png", alt: "표지 사진", fit: "cover", position: "center" }],
    caption: { body: "테스트", hashtags: [] },
    slides: [
      { id: "01", layout: "cover", title: "내가 바꾼 제목\n둘째 줄", body: "사진과 분리된 설명", assetId: "photo", altText: "표지" },
      { id: "02", layout: "scene", title: "다른 주제도\n같은 템플릿으로", body: "<img src=x onerror=alert(1)>", altText: "설명" },
      { id: "03", layout: "compare", title: "원문과 결과", before: "# 회의 정리", after: "회의 정리", altText: "비교" },
      { id: "04", layout: "prompt", title: "직접 읽어보세요", body: "공개 예시만 사용하세요.", prompt: "문서의 핵심 내용을 설명해줘.", altText: "실습" },
      { id: "05", layout: "close", title: "읽을 수 있는\n문서가 늘었습니다", body: "다음 문서에서 직접 확인해보세요.", next: "다음: 다른 파일 형식", altText: "마무리" }
    ]
  };
  await writeFile(path.join(root, "carousel.html"), renderHtml(deck));
  const { stdout } = await runChrome({ browserPath: browser, kind: "dump", url: pathToFileURL(path.join(root, "carousel.html")).href });
  const rendered = stdout.slice(stdout.indexOf('<main id="carousel"'));
  assert.match(rendered, /class="slide slide--cover template--editorial-blue/);
  assert.match(rendered, /class="cover__photo"[\s\S]*?<img[^>]*src="photo.png"/);
  assert.match(rendered, /<h1[^>]*>내가 바꾼 제목\n둘째 줄<\/h1>/);
  assert.match(rendered, /class="slide__body"[^>]*>사진과 분리된 설명<\/p>/);
  assert.match(rendered, /테스트 브랜드/);
  assert.match(rendered, /05 \/ 05/);
  assert.match(rendered, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(rendered, /<img[^>]*onerror=/);
  assert.doesNotMatch(rendered, /scene__extension|plain text|SAVE · TRY · SHARE/);
  assert.match(rendered, /data-ready="true"/);
  assert.match(rendered, /data-missing="false"/);
  assert.match(rendered, /data-overflow="false"/);
});
