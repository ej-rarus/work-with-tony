const DELIMITER = "---";

function isJsonQuoted(value) {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"');
}

function isSingleQuoted(value) {
  return value.length >= 2 && value.startsWith("'") && value.endsWith("'");
}

/** Returns { value, quoted } so numeric coercion can be skipped for quoted strings. */
function unquote(raw) {
  const v = raw.trim();
  if (isJsonQuoted(v)) {
    try {
      return { value: JSON.parse(v), quoted: true };
    } catch {
      return { value: v.slice(1, -1), quoted: true };
    }
  }
  if (isSingleQuoted(v)) return { value: v.slice(1, -1), quoted: true };
  return { value: v, quoted: false };
}

function parseScalar(raw) {
  const { value, quoted } = unquote(raw);
  if (!quoted && /^-?\d+$/.test(value)) return Number(value);
  return value;
}

function findClosingDelimiter(text) {
  const start = DELIMITER.length + 1;
  const withNewline = text.indexOf(`\n${DELIMITER}\n`, start);
  if (withNewline !== -1) return { end: withNewline, bodyStart: withNewline + DELIMITER.length + 2 };
  if (text.endsWith(`\n${DELIMITER}`)) {
    const end = text.length - DELIMITER.length - 1;
    return { end, bodyStart: text.length };
  }
  return null;
}

/**
 * Parse a markdown document with an optional leading frontmatter block.
 * Supports flat `key: value` lines and one level of nesting (`key:` followed by
 * indented `sub: value` lines). Returns { data, body }. Unknown shapes are kept
 * as strings so nothing is silently dropped.
 */
export function parseFrontmatter(text) {
  const normalized = String(text).replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`${DELIMITER}\n`)) return { data: {}, body: normalized };
  const closing = findClosingDelimiter(normalized);
  if (!closing) return { data: {}, body: normalized };
  const block = normalized.slice(DELIMITER.length + 1, closing.end);
  const body = normalized.slice(closing.bodyStart);
  const data = {};
  let currentKey = null;
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const nested = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (nested && currentKey && typeof data[currentKey] === "object") {
      data[currentKey][nested[1]] = parseScalar(nested[2]);
      continue;
    }
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!top) continue;
    const [, key, rest] = top;
    if (rest.trim() === "") {
      data[key] = {};
      currentKey = key;
    } else {
      data[key] = parseScalar(rest);
      currentKey = null;
    }
  }
  return { data, body };
}

function needsQuoting(s) {
  if (/^https?:\/\//.test(s)) return false;
  if (typeof s === "string" && /^-?\d+$/.test(s)) return true;
  return /[:#"\\]|^\s|\s$|^['"]/.test(s);
}

function formatScalar(value) {
  if (typeof value === "number") return String(value);
  const s = String(value);
  return needsQuoting(s) ? JSON.stringify(s) : s;
}

export function serializeFrontmatter(data, body) {
  const lines = [DELIMITER];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") {
      lines.push(`${key}:`);
      for (const [sub, subValue] of Object.entries(value)) {
        if (subValue === undefined || subValue === null) continue;
        lines.push(`  ${sub}: ${formatScalar(subValue)}`);
      }
    } else {
      lines.push(`${key}: ${formatScalar(value)}`);
    }
  }
  lines.push(DELIMITER);
  return `${lines.join("\n")}\n${body}`;
}
