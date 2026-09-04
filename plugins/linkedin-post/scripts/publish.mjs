#!/usr/bin/env node
const MIN_NODE_MAJOR = 20;
if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
  process.stdout.write(`${JSON.stringify({ ok: false, code: "NODE_TOO_OLD", message: `Node ${process.versions.node} detected.`, hint: `This plugin needs Node ${MIN_NODE_MAJOR} or newer.` })}\n`);
  process.exit(2);
}

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ConfigError, getHome, loadToken, tokenStatus } from "./lib/config.mjs";
import { LinkedInApiError, createClient } from "./lib/linkedin-api.mjs";
import { redact } from "./lib/redact.mjs";
import { MAX_POST_LENGTH, countChars, escapeCommentary } from "./lib/text-format.mjs";

const VISIBILITIES = { public: "PUBLIC", connections: "CONNECTIONS" };
const DAY_MS = 24 * 60 * 60 * 1000;

const HINTS = {
  BAD_ARGS: "Usage: node scripts/publish.mjs <body-file> [--visibility public|connections] [--dry-run]",
  FILE_NOT_FOUND: "Check the draft path passed to publish.mjs.",
  EMPTY_BODY: "The draft file is empty. Write the post before publishing.",
  TOO_LONG: `LinkedIn posts are limited to ${MAX_POST_LENGTH} characters. Shorten the draft.`,
  TOKEN_EXPIRED: "Your LinkedIn token has expired. Run `node scripts/auth.mjs` to sign in again.",
};

export class PublishError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublishError";
    this.code = code;
    this.hint = HINTS[code];
  }
}

export function parseArgs(argv) {
  const positional = [];
  let visibility = "PUBLIC";
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--visibility") {
      const value = VISIBILITIES[String(argv[i + 1]).toLowerCase()];
      if (!value) throw new PublishError("BAD_ARGS", `Unknown visibility: ${argv[i + 1]}`);
      visibility = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new PublishError("BAD_ARGS", `Unknown flag: ${arg}`);
    positional.push(arg);
  }
  if (positional.length !== 1) throw new PublishError("BAD_ARGS", "Exactly one body file is required.");
  return { file: positional[0], visibility, dryRun };
}

export function validateBody(text) {
  const trimmed = String(text).trim();
  if (!trimmed) throw new PublishError("EMPTY_BODY", "Body is empty.");
  const chars = countChars(trimmed);
  if (chars > MAX_POST_LENGTH) throw new PublishError("TOO_LONG", `Body has ${chars} characters.`);
  return trimmed;
}

function readBody(file) {
  if (!existsSync(file)) throw new PublishError("FILE_NOT_FOUND", `${file} does not exist.`);
  return validateBody(readFileSync(file, "utf8"));
}

function loadValidToken(home, now, stderr) {
  const token = loadToken(home);
  const status = tokenStatus(token, now());
  if (status === "expired") throw new PublishError("TOKEN_EXPIRED", "Token expired.");
  if (status === "expiring") {
    const days = Math.max(1, Math.ceil((token.expiresAt - now()) / DAY_MS));
    stderr(`warning: LinkedIn token expires in ${days} day(s). Run \`node scripts/auth.mjs\` soon.`);
  }
  return token;
}

function failure(error, secrets) {
  const code = error.code ?? "UNKNOWN";
  const payload = {
    ok: false,
    code,
    message: redact(error.message, secrets),
    hint: error.hint ?? "",
  };
  if (error instanceof LinkedInApiError && error.body) payload.response = redact(error.body, secrets);
  return payload;
}

export async function runPublish(argv, deps = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    sleep,
    stdout = (line) => process.stdout.write(`${line}\n`),
    stderr = (line) => process.stderr.write(`${line}\n`),
  } = deps;
  const secrets = [];
  try {
    const args = parseArgs(argv);
    const body = readBody(args.file);
    const token = loadValidToken(getHome(env), now, stderr);
    secrets.push(token.accessToken);
    const commentary = escapeCommentary(body);
    const request = { author: token.personUrn, commentary, visibility: args.visibility };
    const chars = countChars(body);

    if (args.dryRun) {
      const escapedChars = countChars(commentary);
      stdout(JSON.stringify({ ok: true, dryRun: true, request, chars, escapedChars }));
      return 0;
    }

    const client = createClient({ accessToken: token.accessToken, fetchImpl, sleep });
    const { id, url } = await client.createPost({ authorUrn: token.personUrn, commentary, visibility: args.visibility });
    stdout(JSON.stringify({ ok: true, id, url, chars }));
    return 0;
  } catch (error) {
    stdout(JSON.stringify(failure(error, secrets)));
    if (error instanceof LinkedInApiError) return 1;
    if (error instanceof PublishError || error instanceof ConfigError) return 2;
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPublish(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ ok: false, code: "UNKNOWN", message: String(e?.message ?? e), hint: "" })}\n`);
      process.exit(1);
    });
}
