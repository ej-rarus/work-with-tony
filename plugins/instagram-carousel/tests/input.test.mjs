import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { InputError, inspectSource, readAsset } from "../scripts/lib/input.mjs";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("inspectSource accepts only regular UTF-8 markdown and text files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-input-"));
  const source = path.join(root, "notes.md");
  await writeFile(source, "# 메모\n본문", "utf8");
  const inspected = await inspectSource(source);
  assert.equal(inspected.name, "notes.md");
  assert.equal(inspected.text, "# 메모\n본문");
  assert.match(inspected.sha256, /^[a-f0-9]{64}$/);

  const json = path.join(root, "notes.json");
  await writeFile(json, "{}", "utf8");
  await assert.rejects(() => inspectSource(json), /\.md.*\.txt/i);

  const directory = path.join(root, "folder.txt");
  await mkdir(directory);
  await assert.rejects(() => inspectSource(directory), InputError);
});

test("inspectSource rejects final symlinks, invalid UTF-8, and oversized input", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-source-"));
  const target = path.join(root, "target.md");
  const link = path.join(root, "link.md");
  await writeFile(target, "hello", "utf8");
  await symlink(target, link);
  await assert.rejects(() => inspectSource(link), /symlink/i);

  const invalid = path.join(root, "invalid.txt");
  await writeFile(invalid, Buffer.from([0xc3, 0x28]));
  await assert.rejects(() => inspectSource(invalid), /UTF-8/i);

  const large = path.join(root, "large.md");
  await writeFile(large, Buffer.alloc(131073, 0x61));
  await assert.rejects(() => inspectSource(large), /131072/);
});

test("readAsset validates image signatures and returns bytes without mutating the source", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-asset-"));
  const image = path.join(root, "tony.png");
  await writeFile(image, PNG_1X1);
  const before = await readFile(image);
  const asset = await readAsset({ id: "tony", path: image, alt: "토니 캐릭터", fit: "contain", position: "bottom" });
  assert.equal(asset.mediaType, "image/png");
  assert.equal(asset.originalName, "tony.png");
  assert.equal(asset.bytes.equals(PNG_1X1), true);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await readFile(image)).equals(before), true);
});

test("readAsset refuses extension/signature mismatch, final symlinks, and files over 15 MiB", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "carousel-bad-asset-"));
  const mismatch = path.join(root, "fake.jpg");
  await writeFile(mismatch, PNG_1X1);
  await assert.rejects(() => readAsset({ id: "x", path: mismatch, alt: "x" }), /signature/i);

  const target = path.join(root, "target.png");
  const link = path.join(root, "link.png");
  await writeFile(target, PNG_1X1);
  await symlink(target, link);
  await assert.rejects(() => readAsset({ id: "x", path: link, alt: "x" }), /symlink/i);

  const large = path.join(root, "large.png");
  const bytes = Buffer.alloc(15 * 1024 * 1024 + 1);
  PNG_1X1.copy(bytes);
  await writeFile(large, bytes);
  await assert.rejects(() => readAsset({ id: "x", path: large, alt: "x" }), /15 MiB/i);
});
