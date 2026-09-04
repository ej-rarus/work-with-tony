import assert from "node:assert/strict";
import test from "node:test";
import {
  OAuthError, REDIRECT_URI, SCOPES, buildAuthorizeUrl, exchangeCode, generateState, parseCallback,
} from "../scripts/lib/oauth.mjs";

test("generateState returns 32 hex chars", () => {
  assert.match(generateState(), /^[0-9a-f]{32}$/);
});

test("buildAuthorizeUrl includes client_id, redirect, scope, state", () => {
  const url = new URL(buildAuthorizeUrl({ clientId: "cid", state: "st" }));
  assert.equal(url.origin + url.pathname, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("scope"), SCOPES);
  assert.equal(url.searchParams.get("state"), "st");
});

test("parseCallback returns code when state matches", () => {
  assert.deepEqual(parseCallback("/callback?code=abc&state=st", "st"), { code: "abc" });
});

test("parseCallback rejects mismatched state, denied access, missing code", () => {
  assert.throws(() => parseCallback("/callback?code=abc&state=other", "st"), (e) => e instanceof OAuthError && e.code === "STATE_MISMATCH");
  assert.throws(() => parseCallback("/callback?error=user_cancelled_login&state=st", "st"), (e) => e.code === "ACCESS_DENIED");
  assert.throws(() => parseCallback("/callback?state=st", "st"), (e) => e.code === "MISSING_CODE");
});

test("exchangeCode posts form body and computes expiresAt", async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ access_token: "tok", expires_in: 5184000 }), { status: 200 });
  };
  const now = () => 1_000_000;
  const result = await exchangeCode({ clientId: "cid", clientSecret: "sec", code: "abc", fetchImpl, now });
  assert.deepEqual(result, { accessToken: "tok", expiresAt: 1_000_000 + 5184000 * 1000 });
  assert.equal(captured.url, "https://www.linkedin.com/oauth/v2/accessToken");
  assert.equal(captured.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const params = new URLSearchParams(captured.init.body);
  assert.equal(params.get("grant_type"), "authorization_code");
  assert.equal(params.get("code"), "abc");
  assert.equal(params.get("client_id"), "cid");
  assert.equal(params.get("client_secret"), "sec");
  assert.equal(params.get("redirect_uri"), REDIRECT_URI);
});

test("exchangeCode throws EXCHANGE_FAILED on non-200 without leaking the secret", async () => {
  const fetchImpl = async () => new Response("invalid_client sec", { status: 400 });
  await assert.rejects(
    exchangeCode({ clientId: "cid", clientSecret: "sec", code: "abc", fetchImpl }),
    (e) => e.code === "EXCHANGE_FAILED" && !e.message.includes("sec"),
  );
});

test("exchangeCode throws EXCHANGE_FAILED on malformed or incomplete 200 body", async () => {
  const bad = async () => new Response("not json", { status: 200 });
  await assert.rejects(exchangeCode({ clientId: "cid", clientSecret: "sec", code: "abc", fetchImpl: bad }), (e) => e.code === "EXCHANGE_FAILED");
  const incomplete = async () => new Response(JSON.stringify({ expires_in: 10 }), { status: 200 });
  await assert.rejects(exchangeCode({ clientId: "cid", clientSecret: "sec", code: "abc", fetchImpl: incomplete }), (e) => e.code === "EXCHANGE_FAILED");
});
