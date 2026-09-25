import { writeZip } from "../scripts/lib/zip.mjs";

// Builds a small but realistic HWPX: merged cells, an empty cell encoded as a
// self-closing run, checkboxes, a date line, and a cell holding a nested table.
const P_OPEN = '<hp:p id="0" paraPrIDRef="17" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">';
const LINESEG = '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935" spacing="552" horzpos="0" horzsize="5972" flags="393216"/></hp:linesegarray>';

const para = (text) => text === ""
  ? `${P_OPEN}<hp:run charPrIDRef="10"/>${LINESEG}</hp:p>`
  : `${P_OPEN}<hp:run charPrIDRef="10"><hp:t>${text}</hp:t></hp:run>${LINESEG}</hp:p>`;

export function cell({ row, col, rowSpan = 1, colSpan = 1, text = "", inner = null }) {
  const body = inner ? `${P_OPEN}<hp:run charPrIDRef="10">${inner}</hp:run></hp:p>` : para(text);
  return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="7">`
    + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER">${body}</hp:subList>`
    + `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="${colSpan}" rowSpan="${rowSpan}"/>`
    + `<hp:cellSz width="6993" height="2267"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
}

export function table(rows, { rowCnt, colCnt }) {
  const trs = rows.map((cells) => `<hp:tr>${cells.join("")}</hp:tr>`).join("");
  return `<hp:tbl id="1" rowCnt="${rowCnt}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="3">${trs}</hp:tbl>`;
}

const inTopLevelParagraph = (xml) => `${P_OPEN}<hp:run charPrIDRef="10">${xml}</hp:run></hp:p>`;

// Table 0 - applicant block (4 columns):
//   row 0: [구분 (0,0)] [□ 개인  □ 단체 (0,1) spans 3 cols]
//   row 1: [성 명 (1,0)] [empty (1,1) spans 3 cols]
//   row 2: [연락처 (2,0) spans 2 rows] [휴대폰 (2,1)] [empty (2,2) spans 2 cols]
//   row 3:                             [E-mail (3,1)] [empty (3,2) spans 2 cols]
//   row 4: [date line (4,0) spans 4 cols]
// Table 1 - one cell that contains table 2 (nested, 1x2).
export function sampleSection() {
  const applicant = table([
    [cell({ row: 0, col: 0, text: "구분" }), cell({ row: 0, col: 1, colSpan: 3, text: "□ 개인  □ 단체" })],
    [cell({ row: 1, col: 0, text: "성 명" }), cell({ row: 1, col: 1, colSpan: 3 })],
    [cell({ row: 2, col: 0, rowSpan: 2, text: "연락처" }), cell({ row: 2, col: 1, text: "휴대폰" }), cell({ row: 2, col: 2, colSpan: 2 })],
    [cell({ row: 3, col: 1, text: "E-mail" }), cell({ row: 3, col: 2, colSpan: 2 })],
    [cell({ row: 4, col: 0, colSpan: 4, text: "2026년    월     일   신청인 :         (인)" })],
  ], { rowCnt: 5, colCnt: 4 });
  const nested = table([[cell({ row: 0, col: 0, text: "안쪽 A" }), cell({ row: 0, col: 1 })]], { rowCnt: 1, colCnt: 2 });
  const outer = table([[cell({ row: 0, col: 0, inner: nested })]], { rowCnt: 1, colCnt: 1 });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`
    + `<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section">`
    + inTopLevelParagraph(applicant) + inTopLevelParagraph(outer) + `</hs:sec>`;
}

export function sampleHwpx(sectionXml = sampleSection()) {
  return writeZip([
    { name: "mimetype", data: Buffer.from("application/hwp+zip"), stored: true },
    { name: "version.xml", data: Buffer.from('<?xml version="1.0"?><hv:HCFVersion xmlns:hv="x"/>'), stored: false },
    { name: "Contents/section0.xml", data: Buffer.from(sectionXml), stored: false },
  ]);
}
