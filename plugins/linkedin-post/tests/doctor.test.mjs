import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getPaths, saveToken } from "../scripts/lib/config.mjs";
import {
  checkApiVersionAge, checkApiVersionLive, checkDrafts, checkToken, checkTokenFile,
} from "../scripts/lib/doctor.mjs";
import { LinkedInApiError, probeApiVersion } from "../scripts/lib/linkedin-api.mjs";
import { parseArgs, runDoctor } from "../scripts/doctor.mjs";
import { makeTempHome } from "./helpers.mjs";

const NOW = Date.UTC(2026, 8, 23); // 2026-09-23
const DAY = 24 * 60 * 60 * 1000;
const TOKEN = { accessToken: "tok-secret", expiresAt: NOW + 41 * DAY, personUrn: "urn:li:person:abc", name: "Tony" };

// Answers like LinkedIn: 426 for inactive versions, 403 (no read permission) for active ones.
function versionFetch({ active = ["202608", "202609"], userinfo = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/v2/userinfo")) {
      return new Response(JSON.stringify({ sub: "abc", name: "Tony" }), { status: userinfo });
    }
    const version = init.headers["LinkedIn-Version"];
    return new Response("{}", { status: active.includes(version) ? 403 : 426 });
  };
  return { fetchImpl, calls };
}

function setupHome({ config = true, token = TOKEN } = {}) {
  const { home, cleanup } = makeTempHome();
  if (config) writeFileSync(getPaths(home).config, JSON.stringify({ client_id: "id", client_secret: "shh-secret" }));
  if (token) saveToken(home, token);
  return { home, cleanup };
}

async function doctor(argv, { home, fetchImpl, env = {} }) {
  const out = [];
  const code = await runDoctor(argv, {
    env: { LINKEDIN_POST_HOME: home, ...env },
    fetchImpl,
    now: () => NOW,
    stdout: (line) => out.push(line),
  });
  return { code, out, json: JSON.parse(out.at(-1)) };
}

const byId = (json, id) => json.checks.find((c) => c.id === id);

test("parseArgs accepts --offline only", () => {
  assert.deepEqual(parseArgs([]), { offline: false });
  assert.deepEqual(parseArgs(["--offline"]), { offline: true });
  assert.throws(() => parseArgs(["--nope"]), (e) => e.code === "BAD_ARGS");
});

test("checkApiVersionAge grades a version by months since release", () => {
  assert.equal(checkApiVersionAge("202608", "default", NOW).status, "ok");
  assert.equal(checkApiVersionAge("202608", "default", NOW).stopsAround, "2027-08");
  assert.equal(checkApiVersionAge("202511", "default", NOW).status, "warn");
  assert.equal(checkApiVersionAge("202509", "env", NOW).status, "fail");
  assert.equal(checkApiVersionAge("202612", "env", NOW).status, "warn");
  assert.equal(checkApiVersionAge("202608", "env", NOW).source, "env");
});

test("checkToken reports missing, expiring, expired and valid tokens", () => {
  const empty = setupHome({ token: null });
  assert.equal(checkToken(empty.home, NOW).check.code, "MISSING_TOKEN");
  assert.equal(checkToken(empty.home, NOW).check.status, "fail");
  empty.cleanup();

  const expiring = setupHome({ token: { ...TOKEN, expiresAt: NOW + 3 * DAY } });
  const soon = checkToken(expiring.home, NOW).check;
  assert.equal(soon.status, "warn");
  assert.equal(soon.daysLeft, 3);
  assert.match(soon.hint, /auth\.mjs/);
  expiring.cleanup();

  const expired = setupHome({ token: { ...TOKEN, expiresAt: NOW - DAY } });
  assert.equal(checkToken(expired.home, NOW).check.status, "fail");
  expired.cleanup();

  const valid = setupHome();
  const { check, token } = checkToken(valid.home, NOW);
  assert.equal(check.status, "ok");
  assert.equal(check.expiresOn, "2026-11-03");
  assert.equal(check.daysLeft, 41);
  assert.equal(token.accessToken, "tok-secret");
  valid.cleanup();
});

test("checkTokenFile warns when token.json is readable by others", () => {
  const { home, cleanup } = setupHome();
  assert.equal(checkTokenFile(home).status, "ok");
  chmodSync(getPaths(home).token, 0o644);
  const loose = checkTokenFile(home);
  assert.equal(loose.status, "warn");
  assert.match(loose.hint, /chmod 600/);
  cleanup();
});

test("checkDrafts flags leftover drafts but ignores temporary reactions files", () => {
  const { home, cleanup } = setupHome();
  const { drafts } = getPaths(home);
  assert.equal(checkDrafts(home).status, "ok");
  mkdirSync(drafts, { recursive: true });
  writeFileSync(join(drafts, "reactions-1.md"), "x");
  assert.equal(checkDrafts(home).status, "ok");
  writeFileSync(join(drafts, "1757000000-my-post.md"), "x");
  const left = checkDrafts(home);
  assert.equal(left.status, "warn");
  assert.deepEqual(left.files, ["1757000000-my-post.md"]);
  cleanup();
});

test("probeApiVersion maps 426 to inactive, 403 to active, and 401 to UNAUTHORIZED", async () => {
  const { fetchImpl, calls } = versionFetch();
  const args = { accessToken: "tok", authorUrn: "urn:li:person:abc", fetchImpl };
  assert.equal(await probeApiVersion({ ...args, version: "202608" }), "active");
  assert.equal(await probeApiVersion({ ...args, version: "202509" }), "inactive");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers["LinkedIn-Version"], "202608");
  assert.ok(calls[0].url.includes(encodeURIComponent("urn:li:person:abc")));

  const unauthorized = async () => new Response("{}", { status: 401 });
  await assert.rejects(
    probeApiVersion({ ...args, fetchImpl: unauthorized, version: "202608" }),
    (e) => e instanceof LinkedInApiError && e.code === "UNAUTHORIZED",
  );
});

test("checkApiVersionLive fails an inactive version and names the newest active one", async () => {
  const { fetchImpl } = versionFetch();
  const dead = await checkApiVersionLive({ token: TOKEN, version: "202509", fetchImpl, now: NOW });
  assert.equal(dead.status, "fail");
  assert.equal(dead.latestActive, "202609");
  assert.match(dead.hint, /LINKEDIN_API_VERSION=202609/);

  const alive = await checkApiVersionLive({ token: TOKEN, version: "202608", fetchImpl, now: NOW });
  assert.equal(alive.status, "ok");
  assert.equal(alive.latestActive, "202609");
});

test("runDoctor passes a healthy setup online and never prints secrets", async () => {
  const { home, cleanup } = setupHome();
  const { fetchImpl } = versionFetch();
  const { code, out, json } = await doctor([], { home, fetchImpl });
  assert.equal(code, 0);
  assert.equal(json.ok, true);
  for (const id of ["config", "token", "token-file", "api-version", "drafts", "token-live", "api-version-live"]) {
    assert.ok(byId(json, id), `missing check ${id}`);
  }
  assert.equal(byId(json, "token-live").status, "ok");
  assert.ok(!out.join("").includes("tok-secret"));
  assert.ok(!out.join("").includes("shh-secret"));
  cleanup();
});

test("runDoctor --offline makes no network calls", async () => {
  const { home, cleanup } = setupHome();
  const fetchImpl = async () => { throw new Error("network used"); };
  const { code, json } = await doctor(["--offline"], { home, fetchImpl });
  assert.equal(code, 0);
  assert.equal(byId(json, "token-live"), undefined);
  assert.equal(byId(json, "api-version-live"), undefined);
  cleanup();
});

test("runDoctor fails on missing config and skips live checks without a usable token", async () => {
  const { home, cleanup } = setupHome({ config: false, token: null });
  const { fetchImpl, calls } = versionFetch();
  const { code, json } = await doctor([], { home, fetchImpl });
  assert.equal(code, 1);
  assert.equal(json.ok, false);
  assert.equal(byId(json, "config").code, "MISSING_CONFIG");
  assert.equal(byId(json, "token-live"), undefined);
  assert.equal(calls.length, 0);
  cleanup();
});

test("runDoctor reports a rejected token as a failed live check", async () => {
  const { home, cleanup } = setupHome();
  const { fetchImpl } = versionFetch({ userinfo: 401 });
  const { code, json } = await doctor([], { home, fetchImpl });
  assert.equal(code, 1);
  assert.equal(byId(json, "token-live").status, "fail");
  assert.equal(byId(json, "token-live").code, "UNAUTHORIZED");
  cleanup();
});

test("runDoctor honours LINKEDIN_API_VERSION for the version checks", async () => {
  const { home, cleanup } = setupHome();
  const { fetchImpl } = versionFetch();
  const { json } = await doctor([], { home, fetchImpl, env: { LINKEDIN_API_VERSION: "202509" } });
  assert.equal(byId(json, "api-version").version, "202509");
  assert.equal(byId(json, "api-version").source, "env");
  assert.equal(byId(json, "api-version-live").status, "fail");
  cleanup();
});
