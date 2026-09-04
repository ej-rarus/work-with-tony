import { randomBytes } from "node:crypto";
import { redact } from "./redact.mjs";

export const CALLBACK_PORT = 8585;
export const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
export const SCOPES = "openid profile w_member_social";
export const CALLBACK_TIMEOUT_MS = 120_000;

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

const HINTS = {
  STATE_MISMATCH: "Start sign-in again and use only the window it opens.",
  ACCESS_DENIED: "You cancelled or LinkedIn denied access. Run auth again and approve the request.",
  MISSING_CODE: "LinkedIn did not return a code. Check the redirect URL in your developer app is exactly http://localhost:8585/callback.",
  EXCHANGE_FAILED: "Check client_id and client_secret in config.json, then run auth again.",
  TIMEOUT: "No sign-in completed within 120 seconds. Run auth again.",
  PORT_IN_USE: "Close any other sign-in window or free port 8585, then run auth again.",
  LISTEN_FAILED: "Could not start the local callback server. Check firewall or permissions for port 8585.",
};

export class OAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
    this.hint = HINTS[code];
  }
}

export function generateState(randomBytesImpl = randomBytes) {
  return randomBytesImpl(16).toString("hex");
}

export function buildAuthorizeUrl({ clientId, state }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export function parseCallback(requestUrl, expectedState) {
  const url = new URL(requestUrl, "http://localhost");
  const params = url.searchParams;
  if (params.get("state") !== expectedState) {
    throw new OAuthError("STATE_MISMATCH", "OAuth state did not match. Possible CSRF or stale login window.");
  }
  if (params.get("error")) {
    throw new OAuthError("ACCESS_DENIED", `LinkedIn returned error: ${params.get("error")}`);
  }
  const code = params.get("code");
  if (!code) throw new OAuthError("MISSING_CODE", "Callback did not include an authorization code.");
  return { code };
}

export async function exchangeCode({ clientId, clientSecret, code, fetchImpl = fetch, now = Date.now }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new OAuthError("EXCHANGE_FAILED", `Token exchange failed (${res.status}): ${redact(text, [clientSecret])}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new OAuthError("EXCHANGE_FAILED", "Token response was not valid JSON.");
  }
  if (typeof data.access_token !== "string" || typeof data.expires_in !== "number") {
    throw new OAuthError("EXCHANGE_FAILED", "Token response missing access_token or expires_in.");
  }
  return { accessToken: data.access_token, expiresAt: now() + data.expires_in * 1000 };
}
