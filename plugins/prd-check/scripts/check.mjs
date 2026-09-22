#!/usr/bin/env node
const MIN_NODE_MAJOR = 20;
if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
  process.stdout.write(`${JSON.stringify({ ok: false, code: "NODE_TOO_OLD", message: `Node ${process.versions.node} detected.`, hint: `This plugin needs Node ${MIN_NODE_MAJOR} or newer.` })}\n`);
  process.exit(2);
}

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseMarkdown } from "./lib/markdown.mjs";
import { extractExpectations } from "./lib/template.mjs";
import { RulesError, loadRules } from "./lib/rules.mjs";
import { buildResult, toJson, toMarkdown } from "./lib/report.mjs";
import * as structure from "./lib/checks/structure.mjs";
import * as tables from "./lib/checks/tables.mjs";
import * as requirements from "./lib/checks/requirements.mjs";
import * as placeholders from "./lib/checks/placeholders.mjs";
import * as misplaced from "./lib/checks/misplaced.mjs";

const CHECKS = [structure, tables, requirements, placeholders, misplaced];

const HINTS = {
  BAD_ARGS: "Usage: node scripts/check.mjs <prd.md> --template <template.md> [--rules <rules.json>] [--report <path>] [--json] [--no-report]",
  FILE_NOT_FOUND: "Check the PRD path.",
  TEMPLATE_NOT_FOUND: "Pass --template with the path of your team's PRD template (Markdown).",
  NO_HEADINGS: "The PRD has no Markdown headings. Only Markdown PRDs based on the template can be checked.",
};

const UNKNOWN_HINT = "Unexpected error; re-run with --json and report the message.";

export class CheckError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CheckError";
    this.code = code;
    this.hint = HINTS[code];
  }
}

const VALUE_FLAGS = { "--template": "template", "--rules": "rules", "--report": "report" };

export function parseArgs(argv) {
  const parsed = { file: undefined, template: undefined, rules: undefined, report: undefined, json: false, writeReport: true };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") { parsed.json = true; continue; }
    if (arg === "--no-report") { parsed.writeReport = false; continue; }
    if (VALUE_FLAGS[arg]) {
      if (argv[i + 1] === undefined) throw new CheckError("BAD_ARGS", `${arg} needs a value.`);
      parsed[VALUE_FLAGS[arg]] = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new CheckError("BAD_ARGS", `Unknown flag: ${arg}`);
    positional.push(arg);
  }
  if (positional.length !== 1) throw new CheckError("BAD_ARGS", "Exactly one PRD file is required.");
  if (!parsed.template) throw new CheckError("BAD_ARGS", "--template is required.");
  return { ...parsed, file: positional[0] };
}

function reportPath(file, explicit) {
  if (explicit) return explicit;
  const base = basename(file, extname(file));
  return join(dirname(file), `${base}.check.md`);
}

function isoDate(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function summaryText(result, path) {
  const top = result.findings.slice(0, 3).map((f) => `  ${f.line}: ${f.rule} — ${f.message}`).join("\n");
  return `PRD 검사: 오류 ${result.summary.errorCount}, 확인 ${result.summary.reviewCount}${path ? ` → ${path}` : ""}\n${top}\n`;
}

export function runCheck(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const now = deps.now ?? (() => Date.now());
  const readFile = deps.readFile ?? ((p) => readFileSync(p, "utf8"));
  const writeFile = deps.writeFile ?? ((p, t) => writeFileSync(p, t));
  const exists = deps.exists ?? existsSync;
  let args;
  try {
    args = parseArgs(argv);
    if (!exists(args.file)) throw new CheckError("FILE_NOT_FOUND", `${args.file} not found`);
    if (!exists(args.template)) throw new CheckError("TEMPLATE_NOT_FOUND", `${args.template} not found`);
    const rules = loadRules(args.rules);
    const doc = parseMarkdown(readFile(args.file));
    if (doc.headings.length === 0) throw new CheckError("NO_HEADINGS", "No headings found in the PRD.");
    const expectations = extractExpectations(parseMarkdown(readFile(args.template)));
    const findings = CHECKS.flatMap((check) => check.run(doc, expectations, rules));
    const result = buildResult({ file: args.file, template: args.template, rules: args.rules ?? "default", doc, findings, rulesObject: rules });
    const path = args.writeReport ? reportPath(args.file, args.report) : null;
    if (path) writeFile(path, toMarkdown(result, { date: isoDate(now()) }));
    stdout.write(args.json ? `${toJson({ ...result, report: path })}\n` : summaryText(result, path));
    return result.summary.errorCount > 0 ? 1 : 0;
  } catch (error) {
    const known = error instanceof CheckError || error instanceof RulesError;
    const payload = known
      ? { ok: false, code: error.code, message: error.message, hint: error.hint }
      : { ok: false, code: "UNKNOWN", message: String(error?.message ?? error), hint: UNKNOWN_HINT };
    stdout.write(args?.json || argv.includes("--json") ? `${JSON.stringify(payload)}\n` : `${payload.code}: ${payload.message}\n${payload.hint ?? ""}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCheck(process.argv.slice(2));
}
