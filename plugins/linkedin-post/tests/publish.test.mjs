import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { saveToken } from "../scripts/lib/config.mjs";
import { PublishError, parseArgs, runPublish, validateBody } from "../scripts/publish.mjs";
import { makeTempHome } from "./helpers.mjs";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function setup({ token = { accessToken: "tok", expiresAt: NOW + 30 * DAY, personUrn: "urn:li:person:abc", name: "Tony" }, body = "안녕하세요 (테스트)" } = {}) {
  const { home, cleanup } = makeTempHome();
  if (token) saveToken(home, token);
  const file = join(home, "draft.md");
  writeFileSync(file, body);
  const out = [];
  const err = [];
  const deps = {
    env: { LINKEDIN_POST_HOME: home },
    now: () => NOW,
    sleep: async () => {},
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  };
  return { home, file, out, err, deps, cleanup, lastJson: () => JSON.parse(out.at(-1)) };
}

test("parseArgs reads file, visibility and dry-run", () => {
  assert.deepEqual(parseArgs(["a.md"]), { file: "a.md", visibility: "PUBLIC", dryRun: false, image: null, alt: "" });
  assert.deepEqual(parseArgs(["a.md", "--visibility", "connections", "--dry-run"]), { file: "a.md", visibility: "CONNECTIONS", dryRun: true, image: null, alt: "" });
  assert.throws(() => parseArgs([]), (e) => e instanceof PublishError && e.code === "BAD_ARGS");
  assert.throws(() => parseArgs(["a.md", "--visibility", "everyone"]), (e) => e.code === "BAD_ARGS");
});

test("validateBody rejects empty and over-long text", () => {
  assert.throws(() => validateBody("  \n "), (e) => e.code === "EMPTY_BODY");
  assert.throws(() => validateBody("가".repeat(3001)), (e) => e.code === "TOO_LONG");
  assert.equal(validateBody("  hi  "), "hi");
});

test("validateBody accepts exactly the 3000-character boundary", () => {
  const body = "가".repeat(3000);
  assert.equal(validateBody(body), body);
  assert.equal(validateBody(body).length, 3000);
});

test("missing file exits 2 with FILE_NOT_FOUND", async () => {
  const s = setup();
  try {
    const code = await runPublish([join(s.home, "nope.md")], s.deps);
    assert.equal(code, 2);
    assert.equal(s.lastJson().code, "FILE_NOT_FOUND");
  } finally { s.cleanup(); }
});

test("missing token exits 2 with MISSING_TOKEN hint", async () => {
  const s = setup({ token: null });
  try {
    const code = await runPublish([s.file], s.deps);
    assert.equal(code, 2);
    assert.equal(s.lastJson().code, "MISSING_TOKEN");
    assert.match(s.lastJson().hint, /auth\.mjs/);
  } finally { s.cleanup(); }
});

test("expired token exits 2 with TOKEN_EXPIRED", async () => {
  const s = setup({ token: { accessToken: "tok", expiresAt: NOW - 1, personUrn: "urn:li:person:abc", name: "Tony" } });
  try {
    const code = await runPublish([s.file], s.deps);
    assert.equal(code, 2);
    assert.equal(s.lastJson().code, "TOKEN_EXPIRED");
  } finally { s.cleanup(); }
});

test("dry-run prints escaped request without calling fetch", async () => {
  const s = setup();
  let called = 0;
  s.deps.fetchImpl = async () => { called += 1; };
  try {
    const code = await runPublish([s.file, "--dry-run"], s.deps);
    assert.equal(code, 0);
    assert.equal(called, 0);
    const json = s.lastJson();
    assert.equal(json.dryRun, true);
    assert.equal(json.request.commentary, "안녕하세요 \\(테스트\\)");
    assert.equal(json.request.author, "urn:li:person:abc");
    assert.equal(json.chars, 11);
    assert.equal(json.escapedChars, 13);
  } finally { s.cleanup(); }
});

test("successful publish prints url and exits 0; expiring token warns on stderr", async () => {
  const s = setup({ token: { accessToken: "tok", expiresAt: NOW + 2 * DAY, personUrn: "urn:li:person:abc", name: "Tony" } });
  s.deps.fetchImpl = async () => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:9" } });
  try {
    const code = await runPublish([s.file], s.deps);
    assert.equal(code, 0);
    assert.deepEqual(s.lastJson(), { ok: true, id: "urn:li:share:9", url: "https://www.linkedin.com/feed/update/urn:li:share:9", chars: 11 });
    assert.ok(s.err.some((l) => /expires in 2 day/.test(l)));
  } finally { s.cleanup(); }
});

test("API failure exits 1 with mapped code and never prints the token", async () => {
  const s = setup();
  s.deps.fetchImpl = async () => new Response("bad tok", { status: 400 });
  try {
    const code = await runPublish([s.file], s.deps);
    assert.equal(code, 1);
    const json = s.lastJson();
    assert.equal(json.ok, false);
    assert.equal(json.code, "BAD_REQUEST");
    assert.ok(!JSON.stringify(json).includes("tok"), "token leaked");
  } finally { s.cleanup(); }
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function withImage(s, name = "shot.png", bytes = PNG) {
  const path = join(s.home, name);
  writeFileSync(path, bytes);
  return path;
}

test("parseArgs reads --image and --alt, and requires a value for each", () => {
  assert.deepEqual(parseArgs(["a.md", "--image", "x.png", "--alt", "receipt"]), { file: "a.md", visibility: "PUBLIC", dryRun: false, image: "x.png", alt: "receipt" });
  assert.throws(() => parseArgs(["a.md", "--image"]), (e) => e.code === "BAD_ARGS");
  assert.throws(() => parseArgs(["a.md", "--alt"]), (e) => e.code === "BAD_ARGS");
});

test("image problems exit 2 before any network call", async () => {
  const s = setup();
  let called = 0;
  s.deps.fetchImpl = async () => { called += 1; };
  try {
    assert.equal(await runPublish([s.file, "--image", join(s.home, "missing.png")], s.deps), 2);
    assert.equal(s.lastJson().code, "IMAGE_NOT_FOUND");
    const txt = withImage(s, "note.txt", Buffer.from("hi"));
    assert.equal(await runPublish([s.file, "--image", txt], s.deps), 2);
    assert.equal(s.lastJson().code, "IMAGE_TYPE");
    const big = withImage(s, "big.png", Buffer.alloc(10 * 1024 * 1024 + 1));
    assert.equal(await runPublish([s.file, "--image", big], s.deps), 2);
    assert.equal(s.lastJson().code, "IMAGE_TOO_LARGE");
    assert.equal(called, 0);
  } finally { s.cleanup(); }
});

test("dry-run with an image reports it without uploading", async () => {
  const s = setup();
  let called = 0;
  s.deps.fetchImpl = async () => { called += 1; };
  try {
    const img = withImage(s);
    assert.equal(await runPublish([s.file, "--image", img, "--alt", "receipt", "--dry-run"], s.deps), 0);
    assert.equal(called, 0);
    assert.deepEqual(s.lastJson().image, { path: img, bytes: PNG.length, contentType: "image/png", altText: "receipt" });
  } finally { s.cleanup(); }
});

test("publishing with an image uploads first, then posts with content.media, and reports the image urn", async () => {
  const s = setup();
  const calls = [];
  const responses = [
    new Response(JSON.stringify({ value: { uploadUrl: "https://upload.example/u", image: "urn:li:image:IMG" } }), { status: 200 }),
    new Response(null, { status: 201 }),
    new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:77" } }),
  ];
  s.deps.fetchImpl = async (url, init) => { calls.push({ url, init }); return responses.shift(); };
  try {
    const img = withImage(s);
    assert.equal(await runPublish([s.file, "--image", img, "--alt", "receipt"], s.deps), 0);
    assert.deepEqual(calls.map((c) => c.init.method), ["POST", "PUT", "POST"]);
    assert.deepEqual(JSON.parse(calls[2].init.body).content, { media: { id: "urn:li:image:IMG", altText: "receipt" } });
    const json = s.lastJson();
    assert.equal(json.ok, true);
    assert.equal(json.image, "urn:li:image:IMG");
  } finally { s.cleanup(); }
});

test("a failed image upload never creates the post", async () => {
  const s = setup();
  const calls = [];
  s.deps.fetchImpl = async (url, init) => { calls.push(init.method); return new Response("nope", { status: 403 }); };
  try {
    const img = withImage(s);
    assert.equal(await runPublish([s.file, "--image", img], s.deps), 1);
    assert.equal(s.lastJson().code, "FORBIDDEN");
    assert.deepEqual(calls, ["POST"]);
  } finally { s.cleanup(); }
});

test("a failed PUT after a successful initialize never creates the post", async () => {
  const s = setup();
  const methods = [];
  const responses = [
    new Response(JSON.stringify({ value: { uploadUrl: "https://upload.example/u", image: "urn:li:image:IMG" } }), { status: 200 }),
    new Response("boom", { status: 500 }),
  ];
  s.deps.fetchImpl = async (url, init) => { methods.push(init.method); return responses.shift(); };
  try {
    assert.equal(await runPublish([s.file, "--image", withImage(s)], s.deps), 1);
    assert.equal(s.lastJson().code, "SERVER_ERROR");
    assert.deepEqual(methods, ["POST", "PUT"]);
  } finally { s.cleanup(); }
});

test(".jpeg images are accepted as image/jpeg", async () => {
  const s = setup();
  s.deps.fetchImpl = async () => { throw new Error("should not be called"); };
  try {
    const img = withImage(s, "photo.JPEG");
    assert.equal(await runPublish([s.file, "--image", img, "--dry-run"], s.deps), 0);
    assert.equal(s.lastJson().image.contentType, "image/jpeg");
  } finally { s.cleanup(); }
});
