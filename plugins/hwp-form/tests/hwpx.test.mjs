import assert from "node:assert/strict";
import test from "node:test";
import { readZip, writeZip } from "../scripts/lib/zip.mjs";
import { HwpFormError, applyOps, findCell, loadHwpx, parseTables, saveHwpx } from "../scripts/lib/hwpx.mjs";
import { sampleHwpx, sampleSection } from "./fixture.mjs";

const load = () => loadHwpx(sampleHwpx());
const tablesOf = (doc) => parseTables(doc.sections);
const textAt = (doc, t, r, c) => findCell(tablesOf(doc), t, r, c).text;

test("zip round-trips entries and keeps mimetype first and stored", () => {
  const buf = writeZip([
    { name: "mimetype", data: Buffer.from("application/hwp+zip"), stored: true },
    { name: "Contents/한글.xml", data: Buffer.from("<a>가나다</a>".repeat(50)), stored: false },
  ]);
  const entries = readZip(buf);
  assert.deepEqual(entries.map((e) => e.name), ["mimetype", "Contents/한글.xml"]);
  assert.equal(entries[0].stored, true);
  assert.equal(entries[1].stored, false);
  assert.equal(entries[1].data.toString(), "<a>가나다</a>".repeat(50));
  assert.equal(buf.toString("latin1", 30, 38), "mimetype");
});

test("readZip rejects data that is not a zip", () => {
  assert.throws(() => readZip(Buffer.from("not a zip at all, clearly")), (e) => e.code === "BAD_ZIP");
});

test("parseTables numbers tables in document order and reads logical addresses", () => {
  const tables = tablesOf(load());
  assert.equal(tables.length, 3);
  const [applicant, outer, nested] = tables;
  assert.equal(applicant.rows, 5);
  assert.equal(applicant.cols, 4);
  assert.deepEqual(applicant.cells.map((c) => [c.row, c.col]), [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [2, 2], [3, 1], [3, 2], [4, 0]]);
  assert.deepEqual(findCell(tables, 0, 2, 0), { ...findCell(tables, 0, 2, 0), rowSpan: 2, text: "연락처" });
  assert.equal(findCell(tables, 0, 1, 1).colSpan, 3);
  assert.equal(findCell(tables, 0, 1, 1).text, "");
  assert.equal(nested.parent.table, outer.index);
  assert.equal(findCell(tables, 2, 0, 0).text, "안쪽 A");
  assert.equal(findCell(tables, 1, 0, 0).text, "", "outer cell text must not include the nested table");
});

test("set fills an empty cell that has no text element", () => {
  const doc = applyOps(load(), [{ table: 0, row: 1, col: 1, set: "이은재" }]);
  assert.equal(textAt(doc, 0, 1, 1), "이은재");
  assert.equal(textAt(doc, 0, 1, 0), "성 명");
});

test("set addresses merged cells by logical column, not by position in the row", () => {
  const doc = applyOps(load(), [{ table: 0, row: 3, col: 2, set: "tony@example.com" }]);
  assert.equal(textAt(doc, 0, 3, 2), "tony@example.com");
  assert.equal(textAt(doc, 0, 3, 1), "E-mail");
});

test("set keeps paragraph and character style, escapes XML, and splits lines", () => {
  const doc = applyOps(load(), [{ table: 0, row: 1, col: 1, set: "A&B <팀>\n둘째 줄" }]);
  const cellXml = findCell(tablesOf(doc), 0, 1, 1).xml;
  assert.match(cellXml, /paraPrIDRef="17"/);
  assert.match(cellXml, /charPrIDRef="10"/);
  assert.match(cellXml, /A&amp;B &lt;팀&gt;/);
  assert.equal((cellXml.match(/<hp:p\b/g) ?? []).length, 2);
  assert.doesNotMatch(cellXml, /linesegarray/, "stale layout cache must be dropped");
  assert.equal(textAt(doc, 0, 1, 1), "A&B <팀>\n둘째 줄");
});

test("check marks one box by its label and leaves the others", () => {
  const doc = applyOps(load(), [{ table: 0, row: 0, col: 1, check: "개인" }]);
  assert.equal(textAt(doc, 0, 0, 1), "■ 개인  □ 단체");
  const custom = applyOps(load(), [{ table: 0, row: 0, col: 1, check: "단체", mark: "☑" }]);
  assert.equal(textAt(custom, 0, 0, 1), "□ 개인  ☑ 단체");
});

test("replace edits one exact span inside a cell", () => {
  const doc = applyOps(load(), [{ table: 0, row: 4, col: 0, find: "2026년    월     일", replace: "2026년 5월 6일" }]);
  assert.equal(textAt(doc, 0, 4, 0), "2026년 5월 6일   신청인 :         (인)");
});

test("ops fail loudly instead of silently doing nothing", () => {
  const cases = [
    [{ table: 0, row: 9, col: 0, set: "x" }, "CELL_NOT_FOUND"],
    [{ table: 0, row: 0, col: 1, check: "법인" }, "CHECK_NOT_FOUND"],
    [{ table: 0, row: 4, col: 0, find: "없는 문구", replace: "x" }, "FIND_NOT_FOUND"],
    [{ table: 0, row: 0, col: 1, find: "□", replace: "■" }, "FIND_AMBIGUOUS"],
    [{ table: 1, row: 0, col: 0, set: "x" }, "CELL_HAS_OBJECTS"],
    [{ table: 0, row: 0, col: 0 }, "BAD_PLAN"],
  ];
  for (const [op, code] of cases) {
    assert.throws(() => applyOps(load(), [op]), (e) => e instanceof HwpFormError && e.code === code, code);
  }
});

test("check and replace see only a cell's own text, never its nested table", () => {
  const withOwnText = sampleSection().replace('<hp:run charPrIDRef="10"><hp:tbl id="1" rowCnt="1" colCnt="2"', () => '<hp:run charPrIDRef="10"><hp:t>□ 확인  날짜: $1</hp:t><hp:tbl id="1" rowCnt="1" colCnt="2"');
  const doc = loadHwpx(sampleHwpx(withOwnText));
  assert.throws(() => applyOps(doc, [{ table: 1, row: 0, col: 0, find: "안쪽 A", replace: "바뀜" }]), (e) => e.code === "FIND_NOT_FOUND");
  const edited = applyOps(doc, [
    { table: 1, row: 0, col: 0, check: "확인" },
    { table: 1, row: 0, col: 0, find: "$1", replace: "5월 $& 6일" },
  ]);
  assert.equal(textAt(edited, 1, 0, 0), "■ 확인  날짜: 5월 $& 6일", "replacement text is literal, even with $ patterns");
  assert.equal(textAt(edited, 2, 0, 0), "안쪽 A");
  assert.throws(() => applyOps(doc, [{ table: 1, row: 0, col: 0, set: "x" }]), (e) => e.code === "CELL_HAS_OBJECTS");
});

test("replace explains text that spans two runs and lists the runs", () => {
  const split = sampleSection().replace("<hp:t>2026년    월     일   신청인 :         (인)</hp:t>", "<hp:t> </hp:t></hp:run><hp:run charPrIDRef=\"9\"><hp:t>년    월     일</hp:t>");
  const doc = loadHwpx(sampleHwpx(split));
  assert.throws(
    () => applyOps(doc, [{ table: 0, row: 4, col: 0, find: " 년", replace: "x" }]),
    (e) => e.code === "FIND_SPLIT" && e.op === 0 && e.runs.includes("년    월     일"),
  );
  const fixed = applyOps(doc, [{ table: 0, row: 4, col: 0, find: "년    월     일", replace: "2026년 5월 6일" }]);
  assert.equal(textAt(fixed, 0, 4, 0), " 2026년 5월 6일");
});

test("check and replace drop the layout cache only of the paragraph they changed", () => {
  const twoParas = sampleSection().replace(
    '<hp:t>2026년    월     일   신청인 :         (인)</hp:t></hp:run>',
    '<hp:t>안내 문단</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0"/></hp:linesegarray></hp:p><hp:p id="0" paraPrIDRef="17"><hp:run charPrIDRef="10"><hp:t>2026년    월     일</hp:t></hp:run>',
  );
  const doc = applyOps(loadHwpx(sampleHwpx(twoParas)), [{ table: 0, row: 4, col: 0, find: "월", replace: "5월" }]);
  const cellXml = findCell(tablesOf(doc), 0, 4, 0).xml;
  assert.equal((cellXml.match(/<hp:linesegarray>/g) ?? []).length, 1, "the untouched paragraph keeps its cache");
  assert.match(cellXml, /안내 문단<\/hp:t><\/hp:run><hp:linesegarray>/);
  assert.equal(textAt(doc, 0, 4, 0), "안내 문단\n2026년    5월     일");
});

test("check matches the whole label, not a longer word that starts with it", () => {
  const doc = applyOps(loadHwpx(sampleHwpx(sampleSection().replace("□ 개인  □ 단체", "□ 개인사업자  □ 개인"))), [{ table: 0, row: 0, col: 1, check: "개인" }]);
  assert.equal(textAt(doc, 0, 0, 1), "□ 개인사업자  ■ 개인");
});

test("applyOps does not mutate the loaded document", () => {
  const doc = load();
  applyOps(doc, [{ table: 0, row: 1, col: 1, set: "이은재" }]);
  assert.equal(textAt(doc, 0, 1, 1), "");
});

test("saveHwpx writes a readable archive with the other entries untouched", () => {
  const original = load();
  const saved = loadHwpx(saveHwpx(applyOps(original, [{ table: 2, row: 0, col: 1, set: "안쪽 B" }])));
  assert.equal(textAt(saved, 2, 0, 1), "안쪽 B");
  assert.deepEqual(saved.entries.map((e) => e.name), original.entries.map((e) => e.name));
  assert.equal(saved.entries[0].stored, true);
});

test("loadHwpx refuses an archive without sections", () => {
  const empty = writeZip([{ name: "mimetype", data: Buffer.from("application/hwp+zip"), stored: true }]);
  assert.throws(() => loadHwpx(empty), (e) => e.code === "NO_SECTION");
});
