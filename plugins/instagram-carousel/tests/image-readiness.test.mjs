import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { resolveBrowser, runChrome } from "../scripts/lib/browser.mjs";
import { renderHtml } from "../scripts/lib/render.mjs";

const plugin = fileURLToPath(new URL("../", import.meta.url));

// Reintroducing an unconditional image.decode() wait makes these fail: Chrome
// can finish loading a real image while decode() remains pending in virtual time.
for (const missing of [false, true]) {
  test(`image QA completes with a pending decode promise and ${missing ? "reports a failed image" : "accepts a loaded editorial photo"}`, async (t) => {
    let browser;
    try { browser = await resolveBrowser(); } catch { return t.skip("Chrome/Chromium not installed"); }
    const root = await mkdtemp(path.join(tmpdir(), "carousel-image-readiness-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await Promise.all(["carousel.css", "tokens.css", "carousel.js"].map((file) => copyFile(path.join(plugin, "assets", file), path.join(root, file))));
    if (!missing) {
      await copyFile(path.join(plugin, "examples/assets/md-paper-editorial.png"), path.join(root, "photo.png"));
    }
    // Only decode scheduling is controlled; loading, errors, dimensions, DOM,
    // CSS, and the production readiness implementation run in the real browser.
    await writeFile(path.join(root, "pending-decode.js"), "HTMLImageElement.prototype.decode = function () { return new Promise(() => {}); };\n");
    const deck = {
      version: 1, template: "editorial-blue",
      meta: { brand: "일 잘하는 토니", handle: "@work.with.tony", series: "Markdown", issue: "001", title: "이미지 준비 확인" },
      assets: [{ id: "photo", file: "photo.png", alt: "종이 사진", fit: "cover", position: "center" }],
      caption: { body: "이미지 준비 확인", hashtags: [] },
      slides: [{ id: "01", layout: "scene", title: "이미지도 준비되었나요?", assetId: "photo", altText: "이미지 준비 확인" }]
    };
    const html = renderHtml(deck).replace('<script src="./carousel.js" defer>', '<script src="./pending-decode.js" defer></script>\n  <script src="./carousel.js" defer>');
    await writeFile(path.join(root, "carousel.html"), html);
    const url = `${pathToFileURL(path.join(root, "carousel.html")).href}?slide=01&export=1`;
    const { stdout } = await runChrome({ browserPath: browser, kind: "dump", url });
    const qa = stdout.match(/<output id="carousel-qa"[^>]*>/)?.[0];
    assert.ok(qa, "the renderer creates its QA output");
    assert.match(qa, /data-ready="true"/, "image load/error must settle QA even when decode remains pending");
    assert.match(qa, new RegExp(`data-missing="${missing}"`));
    assert.match(qa, /data-overflow="false"/);
  });
}
