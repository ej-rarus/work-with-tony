export const RESERVED_CHARS = "\\|{}@[]()<>#*_~";
export const MAX_POST_LENGTH = 3000;

const RESERVED = new Set(RESERVED_CHARS);

export function escapeCommentary(text) {
  const chars = Array.from(String(text));
  const out = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (ch === "\\" && next !== undefined && RESERVED.has(next)) {
      out.push(ch, next);
      i += 1;
      continue;
    }
    out.push(RESERVED.has(ch) ? `\\${ch}` : ch);
  }
  return out.join("");
}

export function countChars(text) {
  return Array.from(String(text)).length;
}
