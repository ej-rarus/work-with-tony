import assert from "node:assert/strict";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  ConfigError, EXPIRING_WINDOW_MS, ensureDirs, getHome, getPaths,
  loadConfig, loadToken, saveToken, tokenStatus,
} from "../scripts/lib/config.mjs";
import { redact } from "../scripts/lib/redact.mjs";
import { makeTempHome } from "./helpers.mjs";

test("getHome prefers LINKEDIN_POST_HOME and falls back to ~/.linkedin-post", () => {
  assert.equal(getHome({ LINKEDIN_POST_HOME: "/x/y" }), "/x/y");
  assert.match(getHome({ HOME: "/Users/me" }), /\/Users\/me\/\.linkedin-post$/);
});

test("getPaths returns all expected child paths", () => {
  const p = getPaths("/h");
  assert.deepEqual(p, {
    home: "/h", config: "/h/config.json", token: "/h/token.json",
    references: "/h/references", drafts: "/h/drafts", published: "/h/published",
    myStyle: "/h/my-style.md",
  });
});

test("ensureDirs creates references, drafts, published", () => {
  const { home, cleanup } = makeTempHome();
  try {
    ensureDirs(home);
    for (const d of ["references", "drafts", "published"]) {
      assert.ok(statSync(join(home, d)).isDirectory());
    }
  } finally { cleanup(); }
});

test("loadConfig throws MISSING_CONFIG when file is absent", () => {
  const { home, cleanup } = makeTempHome();
  try {
    assert.throws(() => loadConfig(home), (e) => e instanceof ConfigError && e.code === "MISSING_CONFIG");
  } finally { cleanup(); }
});

test("loadConfig throws INVALID_CONFIG on bad JSON and MISSING_FIELD on missing keys", () => {
  const { home, cleanup } = makeTempHome();
  try {
    writeFileSync(join(home, "config.json"), "{not json");
    assert.throws(() => loadConfig(home), (e) => e.code === "INVALID_CONFIG");
    writeFileSync(join(home, "config.json"), JSON.stringify({ client_id: "abc" }));
    assert.throws(() => loadConfig(home), (e) => e.code === "MISSING_FIELD" && /client_secret/.test(e.message));
  } finally { cleanup(); }
});

test("loadConfig returns camelCase fields", () => {
  const { home, cleanup } = makeTempHome();
  try {
    writeFileSync(join(home, "config.json"), JSON.stringify({ client_id: "id1", client_secret: "sec1" }));
    assert.deepEqual(loadConfig(home), { clientId: "id1", clientSecret: "sec1" });
  } finally { cleanup(); }
});

test("saveToken writes 0600 and loadToken round-trips", () => {
  const { home, cleanup } = makeTempHome();
  try {
    const token = { accessToken: "tok", expiresAt: 1700000000000, personUrn: "urn:li:person:abc", name: "Tony" };
    saveToken(home, token);
    const mode = statSync(join(home, "token.json")).mode & 0o777;
    assert.equal(mode, 0o600);
    assert.deepEqual(loadToken(home), token);
  } finally { cleanup(); }
});

test("loadToken throws MISSING_TOKEN and INVALID_TOKEN", () => {
  const { home, cleanup } = makeTempHome();
  try {
    assert.throws(() => loadToken(home), (e) => e.code === "MISSING_TOKEN");
    writeFileSync(join(home, "token.json"), JSON.stringify({ accessToken: "x" }));
    assert.throws(() => loadToken(home), (e) => e.code === "INVALID_TOKEN");
  } finally { cleanup(); }
});

test("tokenStatus distinguishes valid, expiring, expired", () => {
  const now = 1_000_000_000_000;
  assert.equal(tokenStatus({ expiresAt: now + EXPIRING_WINDOW_MS + 1 }, now), "valid");
  assert.equal(tokenStatus({ expiresAt: now + 1000 }, now), "expiring");
  assert.equal(tokenStatus({ expiresAt: now - 1 }, now), "expired");
});

test("redact replaces every secret occurrence and ignores empty secrets", () => {
  assert.equal(redact("Bearer abc123 and abc123", ["abc123", ""]), "Bearer *** and ***");
});
