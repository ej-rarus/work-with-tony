#!/usr/bin/env node
const MIN_NODE_MAJOR = 20;
if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
  process.stdout.write(`${JSON.stringify({ ok: false, code: "NODE_TOO_OLD", message: `Node ${process.versions.node} detected.`, hint: `This plugin needs Node ${MIN_NODE_MAJOR} or newer.` })}\n`);
  process.exit(2);
}

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseFrontmatter, serializeFrontmatter } from "./lib/frontmatter.mjs";

const COUNTERS = ["likes", "comments", "reposts", "impressions"];

const HINTS = {
  BAD_ARGS: "Usage: node scripts/record.mjs <published-file> [--likes N] [--comments N] [--reposts N] [--impressions N] [--reactions-file <path>]",
  FILE_NOT_FOUND: "Pass the path of a file in published/.",
  NO_FRONTMATTER: "The file has no frontmatter block. Only published posts can be recorded.",
  NOTHING_TO_RECORD: "Give at least one counter flag or --reactions-file.",
};

export class RecordError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RecordError";
    this.code = code;
    this.hint = HINTS[code];
  }
}

function parseCount(flag, raw) {
  if (raw === undefined || !/^\d+$/.test(String(raw))) {
    throw new RecordError("BAD_ARGS", `${flag} needs a non-negative integer, got: ${raw}`);
  }
  return Number(raw);
}

export function parseArgs(argv) {
  const positional = [];
  const counts = {};
  let reactionsFile;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const counter = COUNTERS.find((c) => arg === `--${c}`);
    if (counter) {
      counts[counter] = parseCount(arg, argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--reactions-file") {
      if (argv[i + 1] === undefined) throw new RecordError("BAD_ARGS", "--reactions-file needs a path.");
      reactionsFile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new RecordError("BAD_ARGS", `Unknown flag: ${arg}`);
    positional.push(arg);
  }
  if (positional.length !== 1) throw new RecordError("BAD_ARGS", "Exactly one published file is required.");
  if (Object.keys(counts).length === 0 && !reactionsFile) {
    throw new RecordError("NOTHING_TO_RECORD", "No counters and no reactions file given.");
  }
  return { file: positional[0], counts, reactionsFile };
}

function isoDate(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function applyRecord(document, { counts, reactionsText, today }) {
  const { data, body } = parseFrontmatter(document);
  if (Object.keys(data).length === 0) throw new RecordError("NO_FRONTMATTER", "No frontmatter found.");
  const previous = typeof data.stats === "object" && data.stats ? data.stats : {};
  const stats = { ...previous };
  for (const [key, value] of Object.entries(counts)) stats[key] = value;
  stats.checked = today;
  const nextData = { ...data, stats };
  let nextBody = body;
  if (reactionsText !== undefined) {
    const quoted = String(reactionsText).trim().split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n");
    const section = `## Reactions (${today})\n\n${quoted}\n`;
    nextBody = `${body.replace(/\s+$/, "")}\n\n${section}`;
  }
  return { text: serializeFrontmatter(nextData, nextBody), stats };
}

export function runRecord(argv, deps = {}) {
  const now = deps.now ?? (() => Date.now());
  const stdout = deps.stdout ?? process.stdout;
  const readFile = deps.readFile ?? ((p) => readFileSync(p, "utf8"));
  const writeFile = deps.writeFile ?? ((p, t) => writeFileSync(p, t));
  const exists = deps.exists ?? existsSync;
  try {
    const { file, counts, reactionsFile } = parseArgs(argv);
    if (!exists(file)) throw new RecordError("FILE_NOT_FOUND", `${file} not found`);
    let reactionsText;
    if (reactionsFile) {
      if (!exists(reactionsFile)) throw new RecordError("FILE_NOT_FOUND", `${reactionsFile} not found`);
      reactionsText = readFile(reactionsFile);
    }
    const { text, stats } = applyRecord(readFile(file), { counts, reactionsText, today: isoDate(now()) });
    writeFile(file, text);
    stdout.write(`${JSON.stringify({ ok: true, file, stats })}\n`);
    return 0;
  } catch (error) {
    if (error instanceof RecordError) {
      stdout.write(`${JSON.stringify({ ok: false, code: error.code, message: error.message, hint: error.hint })}\n`);
      return error.code === "BAD_ARGS" || error.code === "NOTHING_TO_RECORD" ? 1 : 2;
    }
    stdout.write(`${JSON.stringify({ ok: false, code: "UNKNOWN", message: String(error?.message ?? error) })}\n`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runRecord(process.argv.slice(2));
}
