import assert from "node:assert/strict";
import test from "node:test";
import { parseFrontmatter, serializeFrontmatter } from "../scripts/lib/frontmatter.mjs";

const SAMPLE = `---
date: 2026-09-10
url: https://www.linkedin.com/feed/update/urn:li:share:1
type: pm-insight
lang: ko
structure: contrarian
---
본문 첫 줄

#PM
`;

test("parses flat frontmatter and keeps the body intact", () => {
  const { data, body } = parseFrontmatter(SAMPLE);
  assert.equal(data.date, "2026-09-10");
  assert.equal(data.url, "https://www.linkedin.com/feed/update/urn:li:share:1");
  assert.equal(data.structure, "contrarian");
  assert.equal(body, "본문 첫 줄\n\n#PM\n");
});

test("parses one level of nested keys and numeric scalars", () => {
  const text = `---\ndate: 2026-09-10\nstats:\n  likes: 12\n  comments: 3\n  checked: 2026-09-12\nseries: doc-standard\n---\nbody\n`;
  const { data } = parseFrontmatter(text);
  assert.deepEqual(data.stats, { likes: 12, comments: 3, checked: "2026-09-12" });
  assert.equal(data.series, "doc-standard");
});

test("returns empty data when there is no frontmatter", () => {
  const { data, body } = parseFrontmatter("plain text\n");
  assert.deepEqual(data, {});
  assert.equal(body, "plain text\n");
});

test("round-trips a document through parse and serialize", () => {
  const { data, body } = parseFrontmatter(SAMPLE);
  assert.equal(serializeFrontmatter(data, body), SAMPLE);
});

test("parses a file whose closing delimiter has no trailing newline", () => {
  const { data, body } = parseFrontmatter("---\ndate: 2026-01-01\nstructure: scene\n---");
  assert.deepEqual(data, { date: "2026-01-01", structure: "scene" });
  assert.equal(body, "");
});

test("round-trips values containing double quotes and backslashes", () => {
  const data = { title: 'he said "hi": ok', path: "C:\\tmp" };
  const out = serializeFrontmatter(data, "x\n");
  assert.deepEqual(parseFrontmatter(out).data, data);
});

test("keeps quoted digit strings as strings and unquoted digits as numbers", () => {
  const { data } = parseFrontmatter('---\ncode: "007"\nlikes: 7\n---\n');
  assert.equal(data.code, "007");
  assert.equal(data.likes, 7);
  assert.deepEqual(parseFrontmatter(serializeFrontmatter(data, "")).data, data);
});

test("a body line of --- is not treated as a delimiter", () => {
  const { data, body } = parseFrontmatter("---\na: 1\n---\nfirst\n---\nsecond\n");
  assert.deepEqual(data, { a: 1 });
  assert.equal(body, "first\n---\nsecond\n");
});

test("serializes nested objects and quotes values containing a colon", () => {
  const out = serializeFrontmatter({ title: "a: b", stats: { likes: 1 } }, "x\n");
  assert.equal(out, `---\ntitle: "a: b"\nstats:\n  likes: 1\n---\nx\n`);
  assert.deepEqual(parseFrontmatter(out).data, { title: "a: b", stats: { likes: 1 } });
});
