import assert from "node:assert/strict";
import test from "node:test";
import { crc32, readZip, writeZip } from "../scripts/lib/zip.mjs";
import { applyOps, findCell, loadHwpx, parseTables, verifyDocument } from "../scripts/lib/hwpx.mjs";
import { sampleHwpx, sampleSection } from "./fixture.mjs";

// Regression tests for issues found in the independent review.
const withDateCell = (inner) => loadHwpx(sampleHwpx(sampleSection().replace("<hp:t>2026년    월     일   신청인 :         (인)</hp:t>", inner)));
const textAt = (doc, t, r, c) => findCell(parseTables(doc.sections), t, r, c).text;
const DATE = { table: 0, row: 4, col: 0 };

test("find matches decoded text, never entity names or markup", () => {
  const doc = withDateCell("<hp:t>R&amp;D 부서</hp:t>");
  assert.throws(() => applyOps(doc, [{ ...DATE, find: "amp", replace: "x" }]), (e) => e.code === "FIND_NOT_FOUND");
  const done = applyOps(doc, [{ ...DATE, find: "R&D", replace: "연구&개발" }]);
  assert.equal(textAt(done, 0, 4, 0), "연구&개발 부서");
  assert.match(findCell(parseTables(done.sections), 0, 4, 0).xml, /연구&amp;개발/);
});

test("find never reaches attributes of child elements such as a tab width", () => {
  const doc = withDateCell('<hp:t>A<hp:tab width="4000" leader="0" type="1"/>B 4000원</hp:t>');
  const done = applyOps(doc, [{ ...DATE, find: "4000", replace: "5000" }]);
  const xml = findCell(parseTables(done.sections), 0, 4, 0).xml;
  assert.match(xml, /width="4000"/);
  assert.match(xml, /B 5000원/);
});

test("a self-closing <hp:t/> does not swallow the markup up to the next text", () => {
  const doc = withDateCell('<hp:t/></hp:run></hp:p><hp:p id="0" paraPrIDRef="26" styleIDRef="0"><hp:run charPrIDRef="10"><hp:t>날짜</hp:t>');
  assert.throws(() => applyOps(doc, [{ ...DATE, find: "26", replace: "2023" }]), (e) => e.code === "FIND_NOT_FOUND");
  assert.equal(textAt(doc, 0, 4, 0), "\n날짜");
});

test("quotes in labels and find strings match text Hancom stores raw", () => {
  const doc = withDateCell('<hp:t>□ "예"  □ "아니오"  제목: "    "</hp:t>');
  const done = applyOps(doc, [{ ...DATE, check: '"예"' }, { ...DATE, find: '"    "', replace: '"테스트"' }]);
  assert.equal(textAt(done, 0, 4, 0), '■ "예"  □ "아니오"  제목: "테스트"');
});

test("set refuses cells with form controls or fields, not just pictures", () => {
  for (const inner of ['<hp:t>x</hp:t><hp:checkBtn caption="a"/>', '<hp:ctrl><hp:fieldBegin type="CLICK_HERE" name="이름"/></hp:ctrl><hp:t>여기</hp:t>']) {
    const doc = withDateCell(inner);
    assert.throws(() => applyOps(doc, [{ ...DATE, set: "y" }]), (e) => e.code === "CELL_HAS_OBJECTS", inner);
  }
});

test("control characters that XML cannot hold are refused in the plan", () => {
  const doc = withDateCell("<hp:t>x</hp:t>");
  for (const op of [{ ...DATE, set: "a\u0001b" }, { ...DATE, find: "x", replace: "\u0007" }, { ...DATE, set: "a\tb" }]) {
    assert.throws(() => applyOps(doc, [op]), (e) => e.code === "BAD_PLAN", JSON.stringify(op));
  }
});

test("verifyDocument checks exact expected text and that nothing else changed", () => {
  const before = withDateCell("<hp:t>팀명(    ) 팀명(A)</hp:t>");
  const ops = [{ ...DATE, find: "팀명(    )", replace: "팀명(A)" }];
  const after = applyOps(before, ops);
  assert.deepEqual(verifyDocument(before, after, ops).map((v) => v.ok), [true]);
  assert.equal(verifyDocument(before, after, ops).failures.length, 0);

  const untouched = verifyDocument(before, before, ops);
  assert.equal(untouched[0].ok, false, "a replacement that already existed in the cell is not proof of the edit");

  const tampered = applyOps(after, [{ table: 0, row: 1, col: 1, set: "몰래" }]);
  const result = verifyDocument(before, tampered, ops);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(result.failures[0], { table: 0, row: 1, col: 1, reason: "changed but not in the plan" });

  const broken = { ...after, sections: after.sections.map((s) => ({ ...s, xml: s.xml.replace("팀명(A)</hp:t>", "팀명(A)</hp:t></hp:t>") })) };
  assert.ok(verifyDocument(before, broken, ops).failures.some((f) => f.reason.startsWith("section XML")));
});

test("replace with an empty string clears a placeholder and verifies exactly", () => {
  const before = withDateCell("<hp:t>(예시) 내용</hp:t>");
  const ops = [{ ...DATE, find: "(예시) ", replace: "" }];
  const after = applyOps(before, ops);
  assert.equal(textAt(after, 0, 4, 0), "내용");
  assert.equal(verifyDocument(before, after, ops).failures.length, 0);
});

test("readZip rejects an entry whose CRC does not match", () => {
  const buf = writeZip([{ name: "a.xml", data: Buffer.from("hello"), stored: true }]);
  const corrupt = Buffer.from(buf);
  corrupt[30 + "a.xml".length] ^= 0xff;
  assert.throws(() => readZip(corrupt), (e) => e.code === "BAD_ZIP");
  assert.equal(crc32(Buffer.from("hello")), 0x3610a686);
});

test("non-UTF-8 entry names survive a round trip byte for byte", () => {
  const cp949 = Buffer.from([0xc7, 0xd1, 0x2e, 0x78, 0x6d, 0x6c]);
  const buf = writeZip([{ name: "x", rawName: cp949, utf8: false, data: Buffer.from("x"), stored: true }]);
  const [entry] = readZip(buf);
  assert.deepEqual(entry.rawName, cp949);
  assert.equal(entry.utf8, false);
  const again = writeZip(readZip(buf));
  assert.deepEqual(again, buf);
});
