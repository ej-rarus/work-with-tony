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
