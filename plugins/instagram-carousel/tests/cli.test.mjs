import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const PLUGIN_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CLI = path.join(PLUGIN_ROOT, "scripts", "carousel.mjs");

function candidate() {
  return {
    version: 1,
    meta: { brand: "일 잘하는 토니", handle: "@work.with.tony", series: "IT 기초", issue: "001", title: "MD" },
    slides: [
      { id: "01", layout: "cover", title: "MD", altText: "표지" },
      { id: "02", layout: "scene", title: "뜻", altText: "뜻" },
      { id: "03", layout: "compare", title: "비교", before: "# 제목", after: "제목", altText: "비교" },
      { id: "04", layout: "statement", title: "텍스트로 충분합니다", altText: "정리" },
      { id: "05", layout: "close", title: "열어보세요", altText: "마무리" }
    ],
    assets: [],
    caption: { body: "MD 파일 기초", hashtags: ["PM"] }
  };
}

async function run(args) {
  try {
    const result = await exec(process.execPath, [CLI, ...args], { cwd: PLUGIN_ROOT });
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

test("inspect and validate emit one JSON result without writing outputs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-cli-"));
  const notes = path.join(root, "notes.md");
  const deckPath = path.join(root, "deck.json");
  await writeFile(notes, "# MD\n설명", "utf8");
  await writeFile(deckPath, JSON.stringify(candidate()), "utf8");

  const inspected = await run(["inspect", "--file", notes, "--json"]);
  assert.equal(inspected.code, 0);
  assert.equal(JSON.parse(inspected.stdout).name, "notes.md");

  const validated = await run(["validate", "--deck", deckPath, "--json"]);
  assert.equal(validated.code, 0);
  assert.equal(JSON.parse(validated.stdout).slides, 5);
});

test("build creates a new project and usage errors exit 2", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-cli-build-"));
  const deckPath = path.join(root, "deck.json");
  const output = path.join(root, "project");
  await writeFile(deckPath, JSON.stringify(candidate()), "utf8");
  const built = await run(["build", "--deck", deckPath, "--out", output, "--json"]);
  assert.equal(built.code, 0);
  assert.equal(JSON.parse(built.stdout).projectDir, output);

  for (const args of [[], ["wat"], ["build", "--deck", deckPath], ["validate", "--deck", deckPath, "--deck", deckPath], ["inspect", "--file", deckPath, "--wat"]]) {
    const result = await run(args);
    assert.equal(result.code, 2, `${args.join(" ")} should be a usage error`);
  }
});

test("a built canonical deck remains the supported editing input, including copied assets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-cli-rebuild-"));
  const image = path.join(root, "tony.png");
  const firstDeck = path.join(root, "candidate.json");
  const firstOutput = path.join(root, "first");
  const secondOutput = path.join(root, "second");
  const input = candidate();
  input.assets = [{ id: "tony", path: image, alt: "토니 캐릭터", fit: "contain", position: "bottom" }];
  input.slides[1].assetId = "tony";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await writeFile(image, png);
  await writeFile(firstDeck, JSON.stringify(input), "utf8");
  assert.equal((await run(["build", "--deck", firstDeck, "--out", firstOutput, "--json"])).code, 0);

  const canonicalDeck = path.join(firstOutput, "deck.json");
  const rebuilt = await run(["build", "--deck", canonicalDeck, "--out", secondOutput, "--json"]);
  assert.equal(rebuilt.code, 0, rebuilt.stderr);
  assert.equal(JSON.parse(rebuilt.stdout).assetCount, 1);
});
