import { existsSync, readdirSync, statSync } from "node:fs";
import { ConfigError, getPaths, loadConfig, loadToken, tokenStatus } from "./config.mjs";
import { createClient, probeApiVersion } from "./linkedin-api.mjs";

// LinkedIn serves each monthly version for roughly 12 months.
export const VERSION_LIFETIME_MONTHS = 12;
export const VERSION_WARN_MONTHS = 10;
const MAX_VERSION_PROBES = 12;
const DAY_MS = 24 * 60 * 60 * 1000;
const AUTH_HINT = "Run `node scripts/auth.mjs` to sign in again.";
const VERSION_HINT = (v) => `Set LINKEDIN_API_VERSION=${v} or update DEFAULT_API_VERSION in scripts/lib/linkedin-api.mjs.`;

const check = (id, status, message, extra = {}) => ({ id, status, message, ...extra });

const monthIndex = (ms) => new Date(ms).getUTCFullYear() * 12 + new Date(ms).getUTCMonth();
const versionIndex = (v) => Number(v.slice(0, 4)) * 12 + Number(v.slice(4)) - 1;
const formatVersion = (index) => `${Math.floor(index / 12)}${String((index % 12) + 1).padStart(2, "0")}`;
const formatMonth = (index) => formatVersion(index).replace(/(\d{4})(\d{2})/, "$1-$2");

export function checkConfig(home) {
  try {
    loadConfig(home);
    return check("config", "ok", "config.json has client_id and client_secret.");
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return check("config", "fail", error.message, { code: error.code, hint: error.hint });
  }
}

export function checkToken(home, now) {
  let token;
  try {
    token = loadToken(home);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    return { check: check("token", "fail", error.message, { code: error.code, hint: error.hint }), token: null };
  }
  const status = tokenStatus(token, now);
  const details = {
    name: token.name,
    expiresOn: new Date(token.expiresAt).toISOString().slice(0, 10),
    daysLeft: Math.floor((token.expiresAt - now) / DAY_MS),
  };
  if (status === "expired") {
    return { check: check("token", "fail", `Token expired on ${details.expiresOn}.`, { ...details, code: "TOKEN_EXPIRED", hint: AUTH_HINT }), token: null };
  }
  if (status === "expiring") {
    return { check: check("token", "warn", `Token expires on ${details.expiresOn}.`, { ...details, hint: AUTH_HINT }), token };
  }
  return { check: check("token", "ok", `Signed in as ${token.name} until ${details.expiresOn}.`, details), token };
}

export function checkTokenFile(home) {
  const path = getPaths(home).token;
  if (!existsSync(path)) return null;
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) {
    return check("token-file", "warn", `token.json is readable by other users (mode ${mode.toString(8)}).`, { hint: `Run \`chmod 600 "${path}"\`.` });
  }
  return check("token-file", "ok", "token.json is private (mode 600).");
}

export function checkApiVersionAge(version, source, now) {
  const age = monthIndex(now) - versionIndex(version);
  const stopsAround = formatMonth(versionIndex(version) + VERSION_LIFETIME_MONTHS);
  const details = { version, source, ageMonths: age, stopsAround };
  if (age < 0) {
    return check("api-version", "warn", `API version ${version} is newer than the current month; LinkedIn may not serve it yet.`, details);
  }
  if (age >= VERSION_LIFETIME_MONTHS) {
    return check("api-version", "fail", `API version ${version} is ${age} months old; LinkedIn has likely retired it.`, { ...details, hint: VERSION_HINT("<recent YYYYMM>") });
  }
  if (age >= VERSION_WARN_MONTHS) {
    return check("api-version", "warn", `API version ${version} is ${age} months old and will stop around ${stopsAround}.`, { ...details, hint: VERSION_HINT("<recent YYYYMM>") });
  }
  return check("api-version", "ok", `API version ${version} should be served until around ${stopsAround}.`, details);
}

export function checkDrafts(home) {
  const { drafts } = getPaths(home);
  const files = existsSync(drafts)
    ? readdirSync(drafts).filter((name) => name.endsWith(".md") && !name.startsWith("reactions-")).sort()
    : [];
  if (files.length === 0) return check("drafts", "ok", "No drafts waiting in drafts/.");
  return check("drafts", "warn", `${files.length} draft(s) left in drafts/; a publish may have failed.`, {
    files,
    hint: "Check your LinkedIn feed before publishing any of these again; the post may already exist.",
  });
}

const apiFailure = (id, error) => {
  if (!error?.code) throw error;
  return check(id, "fail", error.message, { code: error.code, hint: error.hint ?? "" });
};

export async function checkTokenLive({ token, fetchImpl }) {
  try {
    const { name } = await createClient({ accessToken: token.accessToken, fetchImpl }).getUserInfo();
    return check("token-live", "ok", `LinkedIn accepted the token for ${name}.`);
  } catch (error) {
    return apiFailure("token-live", error);
  }
}

async function findLatestActive(probe, now) {
  for (let offset = 0; offset < MAX_VERSION_PROBES; offset += 1) {
    const candidate = formatVersion(monthIndex(now) - offset);
    if ((await probe(candidate)) === "active") return candidate;
  }
  return null;
}

export async function checkApiVersionLive({ token, version, fetchImpl, now }) {
  const probe = (v) => probeApiVersion({ accessToken: token.accessToken, authorUrn: token.personUrn, version: v, fetchImpl });
  try {
    const status = await probe(version);
    const found = await findLatestActive(probe, now);
    const latestActive = status === "active" && (!found || found < version) ? version : found;
    if (status === "inactive") {
      return check("api-version-live", "fail", `LinkedIn no longer serves API version ${version}.`, {
        version, latestActive, code: "API_VERSION_INACTIVE", hint: VERSION_HINT(latestActive ?? "<recent YYYYMM>"),
      });
    }
    return check("api-version-live", "ok", `LinkedIn serves API version ${version}; newest active is ${latestActive}.`, { version, latestActive });
  } catch (error) {
    return apiFailure("api-version-live", error);
  }
}
