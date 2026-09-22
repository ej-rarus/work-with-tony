import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_RULES_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "skills", "check", "references", "default-rules.json",
);

const HINTS = {
  RULES_NOT_FOUND: "Pass --rules with an existing JSON file, or omit it to use the built-in defaults.",
  RULES_INVALID: "The rules file must be valid JSON matching default-rules.json's shape. Fix the named key.",
};

export class RulesError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RulesError";
    this.code = code;
    this.hint = HINTS[code];
  }
}

const STRING_KEYS = ["section", "idColumn", "idPattern", "requirementColumn", "priorityColumn", "statusColumn", "criteriaColumn"];
const ARRAY_KEYS = ["priorityValues", "statusValues", "weakCriteria"];

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isPlainObject(base[key]) && isPlainObject(value) ? deepMerge(base[key], value) : value;
  }
  return merged;
}

function assertRegex(pattern, key) {
  try {
    new RegExp(pattern);
  } catch {
    throw new RulesError("RULES_INVALID", `${key} is not a valid regular expression: ${pattern}`);
  }
}

function assertStringArray(value, key) {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new RulesError("RULES_INVALID", `${key} must be an array of strings`);
  }
}

function validate(rules) {
  const rt = rules.requirementTable;
  if (!isPlainObject(rt)) throw new RulesError("RULES_INVALID", "requirementTable must be an object");
  for (const key of STRING_KEYS) {
    if (typeof rt[key] !== "string") throw new RulesError("RULES_INVALID", `requirementTable.${key} must be a string`);
  }
  for (const key of ARRAY_KEYS) assertStringArray(rt[key], `requirementTable.${key}`);
  assertRegex(rt.idPattern, "requirementTable.idPattern");
  if (typeof rules.placeholderPattern !== "string") throw new RulesError("RULES_INVALID", "placeholderPattern must be a string");
  assertRegex(rules.placeholderPattern, "placeholderPattern");
  for (const key of ["requiredInfoSection", "openItemsSection"]) {
    if (typeof rules[key] !== "string") throw new RulesError("RULES_INVALID", `${key} must be a string`);
  }
  assertStringArray(rules.openItemsHeaders, "openItemsHeaders");
  if (!Array.isArray(rules.misplacedTableSignatures)) throw new RulesError("RULES_INVALID", "misplacedTableSignatures must be an array");
  rules.misplacedTableSignatures.forEach((sig, i) => {
    if (!isPlainObject(sig) || typeof sig.name !== "string") throw new RulesError("RULES_INVALID", `misplacedTableSignatures[${i}].name must be a string`);
    if (sig.allOf !== undefined) assertStringArray(sig.allOf, `misplacedTableSignatures[${i}].allOf`);
    if (sig.anyOf !== undefined) assertStringArray(sig.anyOf, `misplacedTableSignatures[${i}].anyOf`);
  });
  return rules;
}

function readJson(path, code) {
  if (!existsSync(path)) throw new RulesError(code, `${path} not found`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new RulesError("RULES_INVALID", `${path} is not valid JSON`);
  }
}

export function loadRules(path) {
  const defaults = readJson(DEFAULT_RULES_PATH, "RULES_NOT_FOUND");
  if (!path) return validate(defaults);
  const override = readJson(path, "RULES_NOT_FOUND");
  if (!isPlainObject(override)) throw new RulesError("RULES_INVALID", `${path} must contain a JSON object`);
  return validate(deepMerge(defaults, override));
}
