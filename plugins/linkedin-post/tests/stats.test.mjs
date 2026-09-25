import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readWorkbook } from "../scripts/lib/xlsx.mjs";
import { StatsError, aggregate, parseTopPosts, postId } from "../scripts/lib/analytics.mjs";
import { runStats } from "../scripts/stats.mjs";
import { parseFrontmatter } from "../scripts/lib/frontmatter.mjs";
import { makeTempHome } from "./helpers.mjs";
import { postUrl, workbook } from "./xlsx-fixture.mjs";

const EXPORT = {
  byEngagement: [
    { url: postUrl("111"), date: "2026. 9. 10.", value: 47 },
    { url: postUrl("222"), date: "2026. 9. 16.", value: 17 },
    { url: "https://www.linkedin.com/posts/someone-else_x-activity-999-abcd", date: "2026. 9. 1.", value: 3 },
  ],
  byImpressions: [
    { url: postUrl("111"), date: "2026. 9. 10.", value: 1692 },
    { url: postUrl("222"), date: "2026. 9. 16.", value: 1270 },
    { url: postUrl("333"), date: "2026. 9. 22.", value: 90 },
  ],
};

const published = (id, date, extra = "") => `---
date: ${date}
url: https://www.linkedin.com/feed/update/urn:li:share:${id}
type: pm-insight
lang: ko
structure: ${extra || "scene"}
---
본문 ${id}
`;

function setup(files) {
  const { home, cleanup } = makeTempHome();
  mkdirSync(join(home, "published"), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(home, "published", name), text);
  const xlsx = join(home, "export.xlsx");
  writeFileSync(xlsx, workbook(EXPORT));
  const out = [];
  const run = (argv) => runStats(argv, { env: { LINKEDIN_POST_HOME: home }, stdout: (l) => out.push(l) }).then((code) => ({ code, json: JSON.parse(out.at(-1)) }));
  const read = (name) => parseFrontmatter(readFileSync(join(home, "published", name), "utf8")).data;
  return { home, xlsx, run, read, cleanup };
}

test("readWorkbook returns named sheets with shared strings and numbers resolved", () => {
  const book = readWorkbook(workbook(EXPORT));
  assert.deepEqual(book.sheets.map((s) => s.name), ["검색", "인기 게시물"]);
  assert.equal(book.sheets[0].rows[0][1], "2025. 9. 24.~2026. 9. 23.");
  assert.equal(book.sheets[1].rows[3][6], "1692");
  assert.equal(book.sheets[1].rows[3][3], undefined, "gap column stays empty");
});

test("postId reads the share id from both URL shapes", () => {
  assert.equal(postId("https://www.linkedin.com/posts/eunjae-tony-lee_pm-slug-share-7503673910329081856-hGL3"), "7503673910329081856");
  assert.equal(postId("https://www.linkedin.com/feed/update/urn:li:share:7503673910329081856"), "7503673910329081856");
  assert.equal(postId("https://www.linkedin.com/feed/update/urn:li:activity:42"), "42");
  assert.equal(postId("https://example.com"), null);
});

test("parseTopPosts merges both tables by post id and reads the export range", () => {
  const { rangeEnd, rangeDays, posts } = parseTopPosts(readWorkbook(workbook(EXPORT)));
  assert.equal(rangeEnd, "2026-09-23");
  assert.equal(rangeDays, 365);
  const byId = Object.fromEntries(posts.map((p) => [p.id, p]));
  assert.deepEqual(byId["111"], { id: "111", url: postUrl("111"), date: "2026-09-10", engagements: 47, impressions: 1692 });
  assert.equal(byId["333"].engagements, undefined);
  assert.equal(byId["333"].impressions, 90);
});

test("parseTopPosts also reads an English export and fails clearly on another workbook", () => {
  const english = workbook({ ...EXPORT, topSheetName: "TOP POSTS", range: "9/24/2025 - 9/23/2026", headers: ["Post URL", "Post publish date", "Engagements", "Impressions"] });
  const parsed = parseTopPosts(readWorkbook(english));
  assert.equal(parsed.rangeEnd, "2026-09-23");
  assert.equal(parsed.posts.find((p) => p.id === "111").impressions, 1692);
  const other = workbook({ ...EXPORT, topSheetName: "Sheet1", headers: ["a", "b", "c", "d"] });
  assert.throws(() => parseTopPosts(readWorkbook(other)), (e) => e instanceof StatsError && e.code === "NOT_AN_EXPORT");
});

test("import previews by default and changes nothing", async () => {
  const { xlsx, run, read, cleanup } = setup({ "a.md": published("111", "2026-09-10") });
  const { code, json } = await run(["import", xlsx]);
  assert.equal(code, 0);
  assert.equal(json.write, false);
  assert.deepEqual(json.updates[0].after, { impressions: 1692, engagements: 47, checked: "2026-09-23" });
  assert.equal(read("a.md").stats, undefined);
  cleanup();
});

test("import --write records impressions and engagements, keeps likes, and never lowers a count", async () => {
  const withStats = published("222", "2026-09-16").replace("---\n본문", "stats:\n  likes: 9\n  impressions: 1500\n  checked: 2026-09-20\n---\n본문");
  const { xlsx, run, read, cleanup } = setup({ "a.md": published("111", "2026-09-10"), "b.md": withStats, "c.md": published("444", "2026-09-12") });
  const { json } = await run(["import", xlsx, "--write"]);
  assert.equal(json.write, true);
  assert.deepEqual(read("a.md").stats, { impressions: 1692, engagements: 47, checked: "2026-09-23" });
  assert.deepEqual(read("b.md").stats, { likes: 9, impressions: 1500, checked: "2026-09-23", engagements: 17 });
  assert.deepEqual(json.skipped, [{ file: "b.md", field: "impressions", recorded: 1500, exported: 1270 }]);
  assert.deepEqual(json.notInExport, ["c.md"]);
  assert.deepEqual(json.notPublishedHere.map((p) => p.id).sort(), ["333", "999"]);
  cleanup();
});

test("import skips posts published before the export range starts, since their counts are partial", async () => {
  const { home, run, read, cleanup } = setup({ "old.md": published("111", "2026-09-10"), "new.md": published("222", "2026-09-18") });
  const weekly = join(home, "weekly.xlsx");
  writeFileSync(weekly, workbook({ ...EXPORT, range: "2026. 9. 17.~2026. 9. 23." }));
  const { json } = await run(["import", weekly, "--write"]);
  assert.deepEqual(json.updates.map((u) => u.file), ["new.md"]);
  assert.deepEqual(json.skipped, [{ file: "old.md", reason: "published before the export range", rangeStart: "2026-09-17" }]);
  assert.equal(read("old.md").stats, undefined);
  assert.equal(read("new.md").stats.impressions, 1270);
  cleanup();
});

test("aggregate groups mature posts by structure and type and flags small samples", () => {
  const posts = [
    { file: "a", date: "2026-09-01", structure: "scene", type: "pm-insight", stats: { impressions: 1000, engagements: 50, checked: "2026-09-23" } },
    { file: "b", date: "2026-09-03", structure: "scene", type: "pm-insight", stats: { impressions: 600, engagements: 12, checked: "2026-09-23" } },
    { file: "c", date: "2026-09-05", structure: "rules", type: "ai-tools", stats: { impressions: 200, engagements: 2, checked: "2026-09-23" } },
    { file: "d", date: "2026-09-22", structure: "rules", type: "ai-tools", stats: { impressions: 40, engagements: 1, checked: "2026-09-23" } },
    { file: "e", date: "2026-09-06", structure: "compare", type: "ai-tools" },
  ];
  const report = aggregate(posts, { minAgeDays: 3 });
  assert.deepEqual(report.young, ["d"]);
  assert.deepEqual(report.noStats, ["e"]);
  const scene = report.byStructure.find((g) => g.key === "scene");
  assert.deepEqual(scene, { key: "scene", posts: 2, impressionsMean: 800, impressionsMedian: 800, engagementRate: 0.0388, small: true });
  assert.equal(report.byStructure[0].key, "scene", "sorted by mean impressions, highest first");
  assert.equal(report.byType.find((g) => g.key === "ai-tools").posts, 1);
  assert.deepEqual(report.top.map((p) => p.file), ["a", "b", "c"]);
  assert.equal(report.overall.posts, 3);
});

test("report reads published/ and returns the aggregate", async () => {
  const { xlsx, run, cleanup } = setup({ "a.md": published("111", "2026-09-10", "contrarian"), "b.md": published("222", "2026-09-16", "scene") });
  await run(["import", xlsx, "--write"]);
  const { code, json } = await run(["report"]);
  assert.equal(code, 0);
  assert.deepEqual(json.byStructure.map((g) => g.key), ["contrarian", "scene"]);
  cleanup();
});

test("bad arguments and missing files get codes", async () => {
  const { home, run, cleanup } = setup({});
  assert.equal((await run(["dance"])).json.code, "BAD_ARGS");
  assert.equal((await run(["import"])).json.code, "BAD_ARGS");
  const missing = await run(["import", join(home, "nope.xlsx")]);
  assert.equal(missing.code, 2);
  assert.equal(missing.json.code, "FILE_NOT_FOUND");
  writeFileSync(join(home, "junk.xlsx"), "not a zip");
  assert.equal((await run(["import", join(home, "junk.xlsx")])).json.code, "BAD_ZIP");
  cleanup();
});
