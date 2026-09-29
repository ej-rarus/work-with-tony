#!/usr/bin/env node
const MIN_NODE_MAJOR = 20;
if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
  process.stdout.write(`${JSON.stringify({ ok: false, code: "NODE_TOO_OLD", message: `Node ${process.versions.node} detected.`, hint: `This plugin needs Node ${MIN_NODE_MAJOR} or newer.` })}\n`);
  process.exit(2);
}

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { isEntry } from "./lib/entry.mjs";
import { ConfigError, getHome, loadToken, tokenStatus } from "./lib/config.mjs";
import { LinkedInApiError, createClient } from "./lib/linkedin-api.mjs";
import { redact } from "./lib/redact.mjs";
import { MAX_POST_LENGTH, countChars, escapeCommentary } from "./lib/text-format.mjs";

const VISIBILITIES = { public: "PUBLIC", connections: "CONNECTIONS" };
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ALT_LENGTH = 4086;
const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" };

const HINTS = {
  BAD_ARGS: "Usage: node scripts/publish.mjs <body-file> [--visibility public|connections] [--image <png|jpg|gif>] [--alt <text>] [--dry-run]",
  FILE_NOT_FOUND: "Check the draft path passed to publish.mjs.",
  EMPTY_BODY: "The draft file is empty. Write the post before publishing.",
  TOO_LONG: `LinkedIn posts are limited to ${MAX_POST_LENGTH} characters. Shorten the draft.`,
  TOKEN_EXPIRED: "Your LinkedIn token has expired. Run `node scripts/auth.mjs` to sign in again.",
  IMAGE_NOT_FOUND: "Check the path passed to --image.",
  IMAGE_TYPE: "Only .png, .jpg, .jpeg and .gif images can be attached.",
  IMAGE_TOO_LARGE: "Images must be 10 MB or smaller. Resize or re-export the image.",
  ALT_TOO_LONG: `Alt text must be ${MAX_ALT_LENGTH} characters or fewer.`,
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
  let image = null;
  let alt = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--image" || arg === "--alt") {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new PublishError("BAD_ARGS", `${arg} needs a value.`);
      if (arg === "--image") image = argv[i + 1];
      else alt = argv[i + 1];
      i += 1;
      continue;
    }
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
  return { file: positional[0], visibility, dryRun, image, alt };
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

export function readImage(path, alt) {
  if (!existsSync(path)) throw new PublishError("IMAGE_NOT_FOUND", `${path} does not exist.`);
  const contentType = IMAGE_TYPES[extname(path).toLowerCase()];
  if (!contentType) throw new PublishError("IMAGE_TYPE", `${path} is not a png, jpg or gif.`);
  const size = statSync(path).size;
  if (size > MAX_IMAGE_BYTES) throw new PublishError("IMAGE_TOO_LARGE", `${path} is ${size} bytes.`);
  if (countChars(alt) > MAX_ALT_LENGTH) throw new PublishError("ALT_TOO_LONG", `Alt text has ${countChars(alt)} characters.`);
  return { path, bytes: size, contentType, altText: alt, data: readFileSync(path) };
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
    const image = args.image ? readImage(args.image, args.alt) : null;
    const imageSummary = image ? { path: image.path, bytes: image.bytes, contentType: image.contentType, altText: image.altText } : undefined;
    const token = loadValidToken(getHome(env), now, stderr);
    secrets.push(token.accessToken);
    const commentary = escapeCommentary(body);
    const request = { author: token.personUrn, commentary, visibility: args.visibility };
    const chars = countChars(body);

    if (args.dryRun) {
      const escapedChars = countChars(commentary);
      stdout(JSON.stringify({ ok: true, dryRun: true, request, chars, escapedChars, ...(imageSummary ? { image: imageSummary } : {}) }));
      return 0;
    }

    const client = createClient({ accessToken: token.accessToken, fetchImpl, sleep });
    const imageUrn = image ? await client.uploadImage({ ownerUrn: token.personUrn, bytes: image.data }) : null;
    const { id, url } = await client.createPost({
      authorUrn: token.personUrn,
      commentary,
      visibility: args.visibility,
      image: imageUrn ? { id: imageUrn, altText: image.altText } : undefined,
    });
    stdout(JSON.stringify({ ok: true, id, url, chars, ...(imageUrn ? { image: imageUrn } : {}) }));
    return 0;
  } catch (error) {
    stdout(JSON.stringify(failure(error, secrets)));
    if (error instanceof LinkedInApiError) return 1;
    if (error instanceof PublishError || error instanceof ConfigError) return 2;
    return 1;
  }
}

if (isEntry(import.meta.url)) {
  runPublish(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ ok: false, code: "UNKNOWN", message: String(e?.message ?? e), hint: "" })}\n`);
      process.exit(1);
    });
}
