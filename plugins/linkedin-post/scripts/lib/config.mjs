import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const HINTS = {
  MISSING_CONFIG: "Create config.json with client_id and client_secret. See README: 'LinkedIn developer app'.",
  INVALID_CONFIG: "config.json is not valid JSON. Fix or delete it and run setup again.",
  MISSING_FIELD: "config.json must contain both client_id and client_secret.",
  MISSING_TOKEN: "Run `node scripts/auth.mjs` to sign in to LinkedIn.",
  INVALID_TOKEN: "token.json is malformed. Delete it and run `node scripts/auth.mjs` again.",
};

export class ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
    this.hint = HINTS[code];
  }
}

export function getHome(env = process.env) {
  if (env.LINKEDIN_POST_HOME) return env.LINKEDIN_POST_HOME;
  return join(env.HOME ?? homedir(), ".linkedin-post");
}

export function getPaths(home) {
  return {
    home,
    config: join(home, "config.json"),
    token: join(home, "token.json"),
    references: join(home, "references"),
    drafts: join(home, "drafts"),
    published: join(home, "published"),
    myStyle: join(home, "my-style.md"),
  };
}

export function ensureDirs(home) {
  const p = getPaths(home);
  for (const dir of [p.home, p.references, p.drafts, p.published]) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJsonFile(path, missingCode, invalidCode) {
  if (!existsSync(path)) throw new ConfigError(missingCode, `${path} not found`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ConfigError(invalidCode, `${path} is not valid JSON`);
  }
}

export function loadConfig(home) {
  const raw = readJsonFile(getPaths(home).config, "MISSING_CONFIG", "INVALID_CONFIG");
  const missing = ["client_id", "client_secret"].filter((k) => !raw[k]);
  if (missing.length) throw new ConfigError("MISSING_FIELD", `config.json missing: ${missing.join(", ")}`);
  return { clientId: raw.client_id, clientSecret: raw.client_secret };
}

const TOKEN_FIELDS = ["accessToken", "expiresAt", "personUrn", "name"];

export function loadToken(home) {
  const raw = readJsonFile(getPaths(home).token, "MISSING_TOKEN", "INVALID_TOKEN");
  const missing = TOKEN_FIELDS.filter((k) => raw[k] === undefined || raw[k] === null);
  if (missing.length) throw new ConfigError("INVALID_TOKEN", `token.json missing: ${missing.join(", ")}`);
  if (typeof raw.expiresAt !== "number") throw new ConfigError("INVALID_TOKEN", "token.json expiresAt must be a number");
  return Object.fromEntries(TOKEN_FIELDS.map((k) => [k, raw[k]]));
}

export function saveToken(home, token) {
  ensureDirs(home);
  const path = getPaths(home).token;
  writeFileSync(path, JSON.stringify(token, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function tokenStatus(token, now = Date.now()) {
  if (token.expiresAt <= now) return "expired";
  if (token.expiresAt - now <= EXPIRING_WINDOW_MS) return "expiring";
  return "valid";
}
