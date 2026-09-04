import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runAuth } from "../scripts/auth.mjs";
import { makeTempHome } from "./helpers.mjs";

function setup() {
  const { home, cleanup } = makeTempHome();
  const out = [];
  const err = [];
  let browserCalled = false;
  const deps = {
    env: { LINKEDIN_POST_HOME: home },
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    openBrowser: () => { browserCalled = true; },
    waitForCallback: async () => "code1",
  };
  return { home, out, err, deps, cleanup, lastJson: () => JSON.parse(out.at(-1)), browserCalled: () => browserCalled };
}

test("missing config exits 2 with MISSING_CONFIG and never opens the browser", async () => {
  const s = setup();
  try {
    const code = await runAuth(s.deps);
    assert.equal(code, 2);
    assert.equal(s.lastJson().code, "MISSING_CONFIG");
    assert.equal(s.browserCalled(), false);
  } finally { s.cleanup(); }
});

test("token exchange failure exits 1 with EXCHANGE_FAILED and never leaks the secret", async () => {
  const s = setup();
  writeFileSync(join(s.home, "config.json"), JSON.stringify({ client_id: "cid", client_secret: "topsecret" }));
  s.deps.fetchImpl = async () => new Response("invalid_client topsecret", { status: 400 });
  try {
    const code = await runAuth(s.deps);
    assert.equal(code, 1);
    const json = s.lastJson();
    assert.equal(json.code, "EXCHANGE_FAILED");
    assert.ok(!JSON.stringify(json).includes("topsecret"), "secret leaked in stdout");
  } finally { s.cleanup(); }
});

test("happy path exits 0, reports name and personUrn, and writes token.json 0600", async () => {
  const s = setup();
  writeFileSync(join(s.home, "config.json"), JSON.stringify({ client_id: "cid", client_secret: "topsecret" }));
  const calls = [];
  s.deps.fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).includes("accessToken")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 5184000 }), { status: 200 });
    }
    return new Response(JSON.stringify({ sub: "abc123", name: "Tony" }), { status: 200 });
  };
  try {
    const code = await runAuth(s.deps);
    assert.equal(code, 0);
    const json = s.lastJson();
    assert.equal(json.ok, true);
    assert.equal(json.name, "Tony");
    assert.equal(json.personUrn, "urn:li:person:abc123");
    const tokenPath = join(s.home, "token.json");
    assert.ok(existsSync(tokenPath));
    const mode = statSync(tokenPath).mode & 0o777;
    assert.equal(mode, 0o600);
    const token = JSON.parse(readFileSync(tokenPath, "utf8"));
    assert.equal(token.accessToken, "tok");
    assert.equal(token.personUrn, "urn:li:person:abc123");
    assert.equal(token.name, "Tony");
    assert.equal(typeof token.expiresAt, "number");
  } finally { s.cleanup(); }
});
