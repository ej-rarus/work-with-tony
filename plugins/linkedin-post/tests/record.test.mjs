import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { RecordError, applyRecord, parseArgs, runRecord } from "../scripts/record.mjs";
import { parseFrontmatter } from "../scripts/lib/frontmatter.mjs";
import { makeTempHome } from "./helpers.mjs";

const PUBLISHED = `---
date: 2026-09-10
url: https://www.linkedin.com/feed/update/urn:li:share:1
type: pm-insight
lang: ko
structure: contrarian
---
본문입니다.

#PM
`;

function capture() {
  let out = "";
  return { stdout: { write: (s) => { out += s; } }, read: () => out };
}

const FIXED_NOW = () => Date.parse("2026-09-12T03:00:00Z");

test("parseArgs reads counters and the reactions file", () => {
  const parsed = parseArgs(["p.md", "--likes", "12", "--comments", "3", "--reactions-file", "r.md"]);
  assert.deepEqual(parsed, { file: "p.md", counts: { likes: 12, comments: 3 }, reactionsFile: "r.md" });
});

test("parseArgs rejects non-numeric counters, unknown flags, and empty requests", () => {
  assert.throws(() => parseArgs(["p.md", "--likes", "many"]), (e) => e instanceof RecordError && e.code === "BAD_ARGS");
  assert.throws(() => parseArgs(["p.md", "--views", "1"]), (e) => e.code === "BAD_ARGS");
  assert.throws(() => parseArgs(["p.md"]), (e) => e.code === "NOTHING_TO_RECORD");
  assert.throws(() => parseArgs([]), (e) => e.code === "BAD_ARGS");
});

test("applyRecord adds a stats block with checked date and keeps other fields", () => {
  const { text, stats } = applyRecord(PUBLISHED, { counts: { likes: 12, comments: 3 }, today: "2026-09-12" });
  assert.deepEqual(stats, { likes: 12, comments: 3, checked: "2026-09-12" });
  const { data, body } = parseFrontmatter(text);
  assert.equal(data.structure, "contrarian");
  assert.deepEqual(data.stats, stats);
  assert.equal(body, "본문입니다.\n\n#PM\n");
});

test("applyRecord keeps previous counters that were not passed and refreshes checked", () => {
  const first = applyRecord(PUBLISHED, { counts: { likes: 5, comments: 1 }, today: "2026-09-11" }).text;
  const second = applyRecord(first, { counts: { likes: 9 }, today: "2026-09-12" });
  assert.deepEqual(second.stats, { likes: 9, comments: 1, checked: "2026-09-12" });
});

test("applyRecord appends a dated Reactions section from pasted text", () => {
  const { text } = applyRecord(PUBLISHED, { counts: {}, reactionsText: "- 댓글 하나\n- 댓글 둘\n", today: "2026-09-12" });
  const { body } = parseFrontmatter(text);
  assert.equal(body, "본문입니다.\n\n#PM\n\n## Reactions (2026-09-12)\n\n> - 댓글 하나\n> - 댓글 둘\n");
});

test("applyRecord refuses a document without frontmatter", () => {
  assert.throws(() => applyRecord("no frontmatter\n", { counts: { likes: 1 }, today: "2026-09-12" }), (e) => e.code === "NO_FRONTMATTER");
});

test("runRecord writes the file and prints one JSON line", () => {
  const { home, cleanup } = makeTempHome();
  try {
    const dir = join(home, "published");
    mkdirSync(dir);
    const file = join(dir, "2026-09-10-test.md");
    const reactions = join(home, "reactions.md");
    writeFileSync(file, PUBLISHED);
    writeFileSync(reactions, "질문: 어떤 툴 쓰세요?\n");
    const io = capture();
    const code = runRecord([file, "--likes", "20", "--reactions-file", reactions], { now: FIXED_NOW, stdout: io.stdout });
    assert.equal(code, 0);
    const result = JSON.parse(io.read().trim());
    assert.equal(result.ok, true);
    assert.deepEqual(result.stats, { likes: 20, checked: "2026-09-12" });
    const written = readFileSync(file, "utf8");
    assert.match(written, /stats:\n  likes: 20\n  checked: 2026-09-12\n/);
    assert.match(written, /## Reactions \(2026-09-12\)\n\n> 질문: 어떤 툴 쓰세요\?\n$/);
  } finally {
    cleanup();
  }
});

test("runRecord reports a missing file with exit code 2 and usage errors with 1", () => {
  const io = capture();
  assert.equal(runRecord(["/nonexistent/post.md", "--likes", "1"], { now: FIXED_NOW, stdout: io.stdout }), 2);
  assert.equal(JSON.parse(io.read().trim()).code, "FILE_NOT_FOUND");
  const io2 = capture();
  assert.equal(runRecord(["--likes"], { now: FIXED_NOW, stdout: io2.stdout }), 1);
  assert.equal(JSON.parse(io2.read().trim()).code, "BAD_ARGS");
});
