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
  assert.deepEqual(parseArgs(["a.md"]), { file: "a.md", visibility: "PUBLIC", dryRun: false });
  assert.deepEqual(parseArgs(["a.md", "--visibility", "connections", "--dry-run"]), { file: "a.md", visibility: "CONNECTIONS", dryRun: true });
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
