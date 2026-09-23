#!/usr/bin/env node
const MIN_NODE_MAJOR = 20;
if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
  process.stdout.write(`${JSON.stringify({ ok: false, code: "NODE_TOO_OLD", message: `Node ${process.versions.node} detected.`, hint: `This plugin needs Node ${MIN_NODE_MAJOR} or newer.` })}\n`);
  process.exit(2);
}

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getHome, getPaths } from "./lib/config.mjs";
import {
  checkApiVersionAge, checkApiVersionLive, checkConfig, checkDrafts, checkToken, checkTokenFile, checkTokenLive,
} from "./lib/doctor.mjs";
import { resolveApiVersion } from "./lib/linkedin-api.mjs";
import { redact } from "./lib/redact.mjs";

const USAGE = "Usage: node scripts/doctor.mjs [--offline]";

export function parseArgs(argv) {
  const unknown = argv.filter((arg) => arg !== "--offline");
  if (unknown.length) {
    const error = new Error(`Unknown argument: ${unknown[0]}`);
    error.code = "BAD_ARGS";
    error.hint = USAGE;
    throw error;
  }
  return { offline: argv.includes("--offline") };
}

// Values that must never appear in output, even inside an error message.
function secretsIn(home) {
  const read = (path) => {
    try {
      return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    } catch {
      return {};
    }
  };
  const { config, token } = getPaths(home);
  return [read(config).client_secret, read(token).accessToken];
}

export async function runDoctor(argv, deps = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    stdout = (line) => process.stdout.write(`${line}\n`),
  } = deps;
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stdout(JSON.stringify({ ok: false, code: error.code, message: error.message, hint: error.hint }));
    return 2;
  }

  const home = getHome(env);
  const at = now();
  const { version, source } = resolveApiVersion(env);
  const token = checkToken(home, at);
  const localChecks = [
    checkConfig(home),
    token.check,
    checkTokenFile(home),
    checkApiVersionAge(version, source, at),
    checkDrafts(home),
  ].filter(Boolean);

  const liveChecks = args.offline || !token.token
    ? []
    : [
      await checkTokenLive({ token: token.token, fetchImpl }),
      await checkApiVersionLive({ token: token.token, version, fetchImpl, now: at }),
    ];

  const checks = [...localChecks, ...liveChecks];
  const ok = checks.every((c) => c.status !== "fail");
  const secrets = secretsIn(home);
  stdout(redact(JSON.stringify({ ok, home, offline: args.offline, checks }), secrets));
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDoctor(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ ok: false, code: "UNKNOWN", message: String(e?.message ?? e), hint: "" })}\n`);
      process.exit(1);
    });
}
