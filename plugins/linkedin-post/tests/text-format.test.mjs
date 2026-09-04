import assert from "node:assert/strict";
import test from "node:test";
import { MAX_POST_LENGTH, countChars, escapeCommentary } from "../scripts/lib/text-format.mjs";

test("escapes every LinkedIn reserved character", () => {
  const input = String.raw`a\b|c{d}e@f[g]h(i)j<k>l#m*n_o~p`;
  const expected = String.raw`a\\b\|c\{d\}e\@f\[g\]h\(i\)j\<k\>l\#m\*n\_o\~p`;
  assert.equal(escapeCommentary(input), expected);
});

test("does not double-escape characters that are already escaped", () => {
  assert.equal(escapeCommentary(String.raw`\(already\) (not)`), String.raw`\(already\) \(not\)`);
});

test("a doubled backslash is passed through as-is, then the next char is escaped fresh", () => {
  // Input: two literal backslashes followed by "(" (3 chars).
  // The first backslash sees the second backslash as its lookahead - a
  // reserved char - so the pair is treated as "already escaped" and copied
  // through unchanged (2 chars: \\). The loop then moves past both, leaving
  // the "(" to be evaluated on its own and escaped normally (\().
  // Result: 2 + 2 = 4 chars: three backslashes followed by "(".
  const input = "\\\\(";
  const expected = "\\\\\\(";
  assert.equal(escapeCommentary(input), expected);
});

test("preserves Korean, emoji and line breaks", () => {
  const input = "첫 줄입니다.\n\n둘째 줄 🚀 끝";
  assert.equal(escapeCommentary(input), input);
});

test("leaves plain URLs untouched except reserved chars", () => {
  assert.equal(escapeCommentary("https://chi-hoo.com/path?a=1"), "https://chi-hoo.com/path?a=1");
});

test("countChars counts code points so emoji count as one", () => {
  assert.equal(countChars("a🚀b"), 3);
  assert.equal(MAX_POST_LENGTH, 3000);
});
