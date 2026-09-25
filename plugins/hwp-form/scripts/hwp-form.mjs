#!/usr/bin/env node
const MIN_NODE_MAJOR = 20;
if (Number(process.versions.node.split(".")[0]) < MIN_NODE_MAJOR) {
  process.stdout.write(`${JSON.stringify({ ok: false, code: "NODE_TOO_OLD", message: `Node ${process.versions.node} detected.`, hint: `This plugin needs Node ${MIN_NODE_MAJOR} or newer.` })}\n`);
  process.exit(2);
}

import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HwpFormError, applyOps, loadHwpx, parseTables, saveHwpx, validateOp, verifyDocument } from "./lib/hwpx.mjs";

const USAGE = "Usage: node scripts/hwp-form.mjs inspect --file <form.hwpx> [--table N] | fill --file <form.hwpx> --plan <plan.json> --out <new.hwpx>";
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const HINTS = {
  BAD_ARGS: USAGE,
  FILE_NOT_FOUND: "Check the form path.",
  HWP_BINARY: "This is a binary .hwp file, which cannot be written safely. Open it in Hancom Office, choose 파일 > 다른 이름으로 저장, set the format to HWPX (.hwpx), and use that copy.",
  OUTPUT_EXISTS: "Choose a new output path. The tool never overwrites a file, including the original form.",
  VERIFY_FAILED: "The written file did not read back as planned; it was not kept. Report the op shown here.",
};

// Exit codes: 0 success, 1 an op or verification failed, 2 usage/input problem.
const INPUT_CODES = new Set(["BAD_ARGS", "FILE_NOT_FOUND", "HWP_BINARY", "BAD_ZIP", "NO_SECTION", "BAD_XML", "OUTPUT_EXISTS", "BAD_PLAN"]);

class CliError extends HwpFormError {
  constructor(code, message) {
    super(code, message);
    this.hint = HINTS[code] ?? this.hint;
  }
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!["inspect", "fill"].includes(command)) throw new CliError("BAD_ARGS", `Unknown command: ${command ?? "(none)"}`);
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    const [key, value] = [rest[i], rest[i + 1]];
    if (!["--file", "--plan", "--out", "--table"].includes(key) || value === undefined) throw new CliError("BAD_ARGS", `Bad argument: ${key}`);
    flags[key.slice(2)] = value;
  }
  const required = command === "inspect" ? ["file"] : ["file", "plan", "out"];
  const missing = required.filter((k) => !flags[k]);
  if (missing.length) throw new CliError("BAD_ARGS", `Missing --${missing.join(", --")}`);
  if (flags.table !== undefined && !/^\d+$/.test(flags.table)) throw new CliError("BAD_ARGS", "--table must be a table index.");
  return { command, ...flags };
}

function readForm(path) {
  if (!existsSync(path)) throw new CliError("FILE_NOT_FOUND", `${path} does not exist.`);
  const buf = readFileSync(path);
  if (buf.subarray(0, 8).equals(OLE_MAGIC) || /\.hwp$/i.test(path)) throw new CliError("HWP_BINARY", `${path} is a binary HWP file.`);
  return loadHwpx(buf);
}

function readPlan(path) {
  if (!existsSync(path)) throw new CliError("FILE_NOT_FOUND", `${path} does not exist.`);
  let plan;
  try {
    plan = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new HwpFormError("BAD_PLAN", "The plan file is not valid JSON.");
  }
  const ops = Array.isArray(plan) ? plan : plan?.ops;
  if (!Array.isArray(ops) || ops.length === 0) throw new HwpFormError("BAD_PLAN", "The plan needs a non-empty ops array.");
  return ops.map(validateOp);
}

const publicCell = ({ row, col, rowSpan, colSpan, text, hasObjects }) => ({ row, col, rowSpan, colSpan, text, ...(hasObjects ? { objects: true } : {}) });

function inspect({ file, table }) {
  const tables = parseTables(readForm(file).sections)
    .filter((t) => table === undefined || t.index === Number(table))
    .map(({ index, rows, cols, parent, cells }) => ({ index, rows, cols, ...(parent ? { parent } : {}), cells: cells.map(publicCell) }));
  return { ok: true, file, tables };
}

function fill({ file, plan, out }) {
  if (existsSync(out) || resolve(out) === resolve(file)) throw new CliError("OUTPUT_EXISTS", `${out} already exists.`);
  const ops = readPlan(plan);
  const original = readForm(file);
  const filled = saveHwpx(applyOps(original, ops));
  const verified = verifyDocument(original, loadHwpx(filled), ops);
  if (verified.failures.length) {
    const error = new CliError("VERIFY_FAILED", "The filled file did not read back exactly as planned; nothing was written.");
    error.failures = verified.failures;
    throw error;
  }
  writeFileSync(out, filled, { flag: "wx" });
  return { ok: true, file, out, applied: ops.length, verified: [...verified] };
}

export async function run(argv, { stdout = (line) => process.stdout.write(`${line}\n`) } = {}) {
  try {
    const args = parseArgs(argv);
    stdout(JSON.stringify(args.command === "inspect" ? inspect(args) : fill(args)));
    return 0;
  } catch (error) {
    if (!(error instanceof HwpFormError) && error?.code !== "BAD_ZIP") throw error;
    stdout(JSON.stringify({ ok: false, code: error.code, message: error.message, hint: error.hint ?? "", ...(error.op !== undefined ? { op: error.op } : {}), ...(error.runs ? { runs: error.runs } : {}), ...(error.failures ? { failures: error.failures } : {}) }));
    return INPUT_CODES.has(error.code) ? 2 : 1;
  }
}

// Compare real paths: on macOS /tmp is a symlink to /private/tmp.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ ok: false, code: "UNKNOWN", message: String(e?.message ?? e), hint: "" })}\n`);
      process.exit(1);
    });
}
