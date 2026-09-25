#!/usr/bin/env node
const MIN_NODE_MAJOR = 20;
if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
  process.stdout.write(`${JSON.stringify({ ok: false, code: "NODE_TOO_OLD", message: `Node ${process.versions.node} detected.`, hint: `This plugin needs Node ${MIN_NODE_MAJOR} or newer.` })}\n`);
  process.exit(2);
}

import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { aggregate, parseTopPosts, postId } from "./lib/analytics.mjs";
import { getHome, getPaths } from "./lib/config.mjs";
import { parseFrontmatter, serializeFrontmatter } from "./lib/frontmatter.mjs";
import { readWorkbook } from "./lib/xlsx.mjs";

const USAGE = "Usage: node scripts/stats.mjs import <AggregateAnalytics.xlsx> [--write] | report [--min-age DAYS]";
const HINTS = {
  BAD_ARGS: USAGE,
  FILE_NOT_FOUND: "Pass the path of the .xlsx downloaded from LinkedIn analytics.",
  NO_PUBLISHED: "No published/ folder yet. Publish a post first.",
};
const FIELDS = ["impressions", "engagements"];
// Exit codes follow record.mjs: 0 success, 1 usage error, 2 file or data problem.
const USAGE_CODES = new Set(["BAD_ARGS"]);

class CliError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.hint = HINTS[code] ?? "";
  }
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command === "import") {
    const files = rest.filter((a) => !a.startsWith("--"));
    const flags = rest.filter((a) => a.startsWith("--"));
    if (files.length !== 1 || flags.some((f) => f !== "--write")) throw new CliError("BAD_ARGS", "import needs one .xlsx path and optionally --write.");
    return { command, file: files[0], write: flags.includes("--write") };
  }
  if (command === "report") {
    if (rest.length === 0) return { command, minAgeDays: 3 };
    if (rest.length === 2 && rest[0] === "--min-age" && /^\d+$/.test(rest[1])) return { command, minAgeDays: Number(rest[1]) };
    throw new CliError("BAD_ARGS", "report takes only --min-age DAYS.");
  }
  throw new CliError("BAD_ARGS", `Unknown command: ${command ?? "(none)"}`);
}

function loadPublished(home) {
  const dir = getPaths(home).published;
  if (!existsSync(dir)) throw new CliError("NO_PUBLISHED", `${dir} does not exist.`);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const path = join(dir, name);
      const text = readFileSync(path, "utf8");
      const { data, body } = parseFrontmatter(text);
      return { file: name, path, data, body, id: postId(data.url) };
    });
}

function planUpdate(post, exported, { rangeStart, rangeEnd }) {
  const before = typeof post.data.stats === "object" && post.data.stats ? post.data.stats : {};
  // A shorter export (for example the last 7 days) counts only part of an
  // older post's life; recording it would understate the post.
  if (rangeStart && post.data.date && String(post.data.date) < rangeStart) {
    return { before, after: null, skipped: [{ file: post.file, reason: "published before the export range", rangeStart }] };
  }
  const skipped = FIELDS
    .filter((f) => typeof exported[f] === "number" && typeof before[f] === "number" && exported[f] < before[f])
    .map((field) => ({ file: post.file, field, recorded: before[field], exported: exported[field] }));
  const changes = Object.fromEntries(FIELDS
    .filter((f) => typeof exported[f] === "number" && !skipped.some((s) => s.field === f) && exported[f] !== before[f])
    .map((f) => [f, exported[f]]));
  const after = Object.keys(changes).length ? { ...before, ...changes, checked: rangeEnd ?? before.checked } : null;
  return { before, after, skipped };
}

function importExport({ file, write }, home) {
  if (!existsSync(file)) throw new CliError("FILE_NOT_FOUND", `${file} not found.`);
  const exported = parseTopPosts(readWorkbook(readFileSync(file)));
  const byId = new Map(exported.posts.map((p) => [p.id, p]));
  const published = loadPublished(home);
  const plans = published.filter((p) => byId.has(p.id)).map((p) => ({ post: p, ...planUpdate(p, byId.get(p.id), exported) }));
  const updates = plans.filter((p) => p.after).map(({ post, before, after }) => ({ file: post.file, before, after }));
  if (write) {
    for (const { post, after } of plans.filter((p) => p.after)) {
      writeFileSync(post.path, serializeFrontmatter({ ...post.data, stats: after }, post.body));
    }
  }
  const publishedIds = new Set(published.map((p) => p.id));
  return {
    ok: true,
    write,
    export: { rangeStart: exported.rangeStart, rangeEnd: exported.rangeEnd, rangeDays: exported.rangeDays, posts: exported.posts.length },
    updates,
    skipped: plans.flatMap((p) => p.skipped),
    notInExport: published.filter((p) => !byId.has(p.id)).map((p) => p.file),
    notPublishedHere: exported.posts.filter((p) => !publishedIds.has(p.id)).map(({ id, url, date }) => ({ id, url, date })),
  };
}

function report({ minAgeDays }, home) {
  const posts = loadPublished(home).map(({ file, data }) => ({
    file, date: data.date, structure: data.structure, type: data.type, series: data.series, stats: typeof data.stats === "object" ? data.stats : undefined,
  }));
  return { ok: true, ...aggregate(posts, { minAgeDays }) };
}

export async function runStats(argv, deps = {}) {
  const { env = process.env, stdout = (line) => process.stdout.write(`${line}\n`) } = deps;
  try {
    const args = parseArgs(argv);
    const home = getHome(env);
    stdout(JSON.stringify(args.command === "import" ? importExport(args, home) : report(args, home)));
    return 0;
  } catch (error) {
    if (!error?.code) throw error;
    stdout(JSON.stringify({ ok: false, code: error.code, message: error.message, hint: error.hint ?? "" }));
    return USAGE_CODES.has(error.code) ? 1 : 2;
  }
}

// Compare real paths: on macOS /tmp is a symlink to /private/tmp.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runStats(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ ok: false, code: "UNKNOWN", message: String(e?.message ?? e), hint: "" })}\n`);
      process.exit(1);
    });
}
