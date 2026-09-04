import assert from "node:assert/strict";
import test from "node:test";
import {
  API_VERSION, LinkedInApiError, POSTS_URL, USERINFO_URL, createClient, mapStatusToError, postUrl,
} from "../scripts/lib/linkedin-api.mjs";

function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return new Response(next.body ?? null, { status: next.status, headers: next.headers ?? {} });
  };
  return { fetchImpl, calls };
}

test("getUserInfo sends bearer token and returns sub and name", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: JSON.stringify({ sub: "abc", name: "Tony" }) }]);
  const client = createClient({ accessToken: "tok", fetchImpl });
  assert.deepEqual(await client.getUserInfo(), { sub: "abc", name: "Tony" });
  assert.equal(calls[0].url, USERINFO_URL);
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
});

test("createPost sends the documented body and headers and returns id + url", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 201, headers: { "x-restli-id": "urn:li:share:123" } }]);
  const client = createClient({ accessToken: "tok", fetchImpl });
  const result = await client.createPost({ authorUrn: "urn:li:person:abc", commentary: "hello", visibility: "PUBLIC" });
  assert.deepEqual(result, { id: "urn:li:share:123", url: "https://www.linkedin.com/feed/update/urn:li:share:123" });
  const { url, init } = calls[0];
  assert.equal(url, POSTS_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["LinkedIn-Version"], API_VERSION);
  assert.equal(init.headers["X-Restli-Protocol-Version"], "2.0.0");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), {
    author: "urn:li:person:abc",
    commentary: "hello",
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
});

test("mapStatusToError maps statuses to codes with hints", () => {
  assert.equal(mapStatusToError(401, "").code, "UNAUTHORIZED");
  assert.equal(mapStatusToError(403, "").code, "FORBIDDEN");
  assert.equal(mapStatusToError(400, "").code, "BAD_REQUEST");
  assert.equal(mapStatusToError(422, "").code, "BAD_REQUEST");
  assert.equal(mapStatusToError(429, "").code, "RATE_LIMITED");
  assert.equal(mapStatusToError(503, "").code, "SERVER_ERROR");
  assert.equal(mapStatusToError(418, "").code, "UNKNOWN");
  assert.match(mapStatusToError(403, "").hint, /Share on LinkedIn/);
  assert.match(mapStatusToError(401, "").hint, /auth\.mjs/);
});

test("createPost throws LinkedInApiError with body on 5xx and does not retry", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 500, body: "boom" }]);
  const client = createClient({ accessToken: "tok", fetchImpl });
  await assert.rejects(
    client.createPost({ authorUrn: "u", commentary: "c", visibility: "PUBLIC" }),
    (e) => e instanceof LinkedInApiError && e.code === "SERVER_ERROR" && e.body === "boom",
  );
  assert.equal(calls.length, 1);
});

test("createPost retries a pre-send network failure (ECONNREFUSED) once, then succeeds", async () => {
  const preSendError = new TypeError("fetch failed");
  preSendError.cause = { code: "ECONNREFUSED" };
  const { fetchImpl, calls } = fakeFetch([preSendError, { status: 201, headers: { "x-restli-id": "id2" } }]);
  const slept = [];
  const client = createClient({ accessToken: "tok", fetchImpl, sleep: async (ms) => slept.push(ms), retryDelayMs: 3000 });
  const result = await client.createPost({ authorUrn: "u", commentary: "c", visibility: "PUBLIC" });
  assert.equal(result.id, "id2");
  assert.equal(calls.length, 2);
  assert.deepEqual(slept, [3000]);
});

test("createPost does not retry a bare fetch failure with no cause (may have reached the server)", async () => {
  const { fetchImpl, calls } = fakeFetch([new TypeError("fetch failed")]);
  const client = createClient({ accessToken: "tok", fetchImpl, sleep: async () => {} });
  await assert.rejects(
    client.createPost({ authorUrn: "u", commentary: "c", visibility: "PUBLIC" }),
    (e) => e instanceof LinkedInApiError && e.code === "NETWORK",
  );
  assert.equal(calls.length, 1);
});

test("getUserInfo still retries a bare fetch failure once", async () => {
  const { fetchImpl, calls } = fakeFetch([new TypeError("fetch failed"), { status: 200, body: JSON.stringify({ sub: "abc", name: "Tony" }) }]);
  const client = createClient({ accessToken: "tok", fetchImpl, sleep: async () => {} });
  const result = await client.getUserInfo();
  assert.deepEqual(result, { sub: "abc", name: "Tony" });
  assert.equal(calls.length, 2);
});

test("network failure twice surfaces NETWORK error", async () => {
  const { fetchImpl } = fakeFetch([new TypeError("fetch failed"), new TypeError("fetch failed")]);
  const client = createClient({ accessToken: "tok", fetchImpl, sleep: async () => {} });
  await assert.rejects(client.getUserInfo(), (e) => e.code === "NETWORK");
});

test("postUrl builds the feed update URL", () => {
  assert.equal(postUrl("x"), "https://www.linkedin.com/feed/update/x");
});
