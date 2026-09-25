import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, lstat, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ProjectError, buildProject } from "../scripts/lib/project.mjs";

const PLUGIN_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function deck(assetPath) {
  return {
    version: 1,
    meta: { brand: "일 잘하는 토니", handle: "@work.with.tony", series: "IT 기초", issue: "001", title: "MD 파일이란?" },
    slides: [
      { id: "01", layout: "cover", title: "MD 파일이란?", body: "<\/script><script>globalThis.pwned=1<\/script>", altText: "MD 파일 표지" },
      { id: "02", layout: "scene", title: "파일을 열어보면", body: "글자와 기호가 보입니다.", assetId: assetPath ? "tony" : undefined, altText: "파일과 토니 캐릭터" },
      { id: "03", layout: "compare", title: "기호가 서식이 됩니다", before: "# 제목", after: "제목", altText: "원문과 결과 비교" },
      { id: "04", layout: "prompt", title: "AI에게 이렇게 물어보세요", prompt: "이 MD 파일을 PM이 이해할 수 있게 설명해줘.", altText: "AI 질문 예시" },
      { id: "05", layout: "close", title: "README.md부터 열어보세요", next: "다음 편: HTML", altText: "다음 편을 예고하는 마무리" }
    ],
    assets: assetPath ? [{ id: "tony", path: assetPath, alt: "파란 옷의 토니 캐릭터", fit: "contain", position: "bottom" }] : [],
    caption: { body: "개발자가 보내준 .md 파일, 이제 직접 열어보세요.", hashtags: ["PM", "마크다운", "일잘하는토니"] }
  };
}

test("buildProject creates a private, editable, self-contained project", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-project-"));
  const image = path.join(root, "tony.png");
  const output = path.join(root, "built");
  await writeFile(image, PNG_1X1);

  const result = await buildProject({ candidate: deck(image), outDir: output, pluginRoot: PLUGIN_ROOT });
  assert.equal(result.projectDir, output);
  for (const relative of ["deck.json", "carousel.html", "carousel.js", "tokens.css", "carousel.css", "caption.md", "alt-text.md", "build-report.json"]) {
    await access(path.join(output, relative));
  }

  const projectMode = (await lstat(output)).mode & 0o777;
  const deckMode = (await lstat(path.join(output, "deck.json"))).mode & 0o777;
  assert.equal(projectMode, 0o700);
  assert.equal(deckMode, 0o600);

  const canonical = JSON.parse(await readFile(path.join(output, "deck.json"), "utf8"));
  assert.equal(canonical.assets.length, 1);
  assert.match(canonical.assets[0].file, /^assets\/[a-f0-9]{16}\.png$/);
  assert.equal(JSON.stringify(canonical).includes(image), false);
  assert.deepEqual(canonical.slides.map((slide) => slide.layout), ["cover", "scene", "compare", "prompt", "close"]);

  const html = await readFile(path.join(output, "carousel.html"), "utf8");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.equal(html.includes("<script>globalThis.pwned=1</script>"), false);
  assert.equal(html.includes("\\u003c/script>"), true);

  const js = await readFile(path.join(output, "carousel.js"), "utf8");
  assert.equal(/\.innerHTML\s*=|insertAdjacentHTML|srcdoc|\beval\s*\(/.test(js), false);
  assert.match(js, /textContent/);

  const css = await readFile(path.join(output, "carousel.css"), "utf8");
  assert.match(css.split("\n")[0], /^\/\* Hallmark · macrostructure: Component Playground/);
  assert.equal(css.includes("linear-gradient"), false);
  assert.equal(css.includes("box-shadow"), false);
});

test("build report hashes every trusted file except itself", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-report-"));
  const output = path.join(root, "built");
  await buildProject({ candidate: deck(), outDir: output, pluginRoot: PLUGIN_ROOT });
  const report = JSON.parse(await readFile(path.join(output, "build-report.json"), "utf8"));
  assert.equal(report.version, 1);
  assert.equal(report.files.some((entry) => entry.path === "build-report.json"), false);
  assert.deepEqual(report.files.map((entry) => entry.path).sort(), ["alt-text.md", "caption.md", "carousel.css", "carousel.html", "carousel.js", "deck.json", "tokens.css"]);
  for (const entry of report.files) {
    const bytes = await readFile(path.join(output, entry.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    assert.equal(bytes.length, entry.bytes);
  }
});

test("buildProject refuses an existing output and any output inside the plugin tree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-output-"));
  const existing = path.join(root, "existing");
  await mkdir(existing);
  await assert.rejects(() => buildProject({ candidate: deck(), outDir: existing, pluginRoot: PLUGIN_ROOT }), /already exists/i);

  const inside = path.join(PLUGIN_ROOT, "generated-project");
  await assert.rejects(() => buildProject({ candidate: deck(), outDir: inside, pluginRoot: PLUGIN_ROOT }), /plugin tree/i);
  await assert.rejects(() => access(inside));
});

test("all seven layout names have dedicated renderer branches", async () => {
  const source = await readFile(path.join(PLUGIN_ROOT, "assets", "carousel.js"), "utf8");
  for (const layout of ["cover", "scene", "compare", "checklist", "prompt", "statement", "close"]) {
    assert.match(source, new RegExp(`renderers\\.${layout}\\s*=`));
  }
});
