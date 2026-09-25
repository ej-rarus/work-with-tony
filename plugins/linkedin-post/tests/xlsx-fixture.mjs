import { writeZip } from "../scripts/lib/zip.mjs";

// Builds a minimal LinkedIn "AggregateAnalytics" workbook. Only the parts the
// importer reads are real: workbook sheet names, rels, shared strings, and the
// top-posts sheet with its two side-by-side tables.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const COLS = "ABCDEFGHIJ";

export function workbook({ range = "2025. 9. 24.~2026. 9. 23.", byEngagement = [], byImpressions = [], topSheetName = "인기 게시물", headers = ["게시물 URL", "올린 날짜", "참여수", "노출수"] } = {}) {
  const strings = [];
  const s = (text) => {
    const i = strings.indexOf(text);
    return i >= 0 ? i : strings.push(text) - 1;
  };
  const cell = (ref, value) => (typeof value === "number"
    ? `<c r="${ref}"><v>${value}</v></c>`
    : `<c r="${ref}" t="s"><v>${s(value)}</v></c>`);
  const row = (n, values) => `<row r="${n}">${values.map((v, i) => (v === null ? "" : cell(`${COLS[i]}${n}`, v))).join("")}</row>`;
  const sheet = (rows) => `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`;

  const summary = sheet([row(1, ["전반적인 성과", range]), row(2, ["노출수", 5566])]);
  const count = Math.max(byEngagement.length, byImpressions.length);
  const topRows = [
    row(1, ["이 목록에 게시물을 50개까지 포함할 수 있습니다."]),
    row(3, [headers[0], headers[1], headers[2], null, headers[0], headers[1], headers[3]]),
    ...Array.from({ length: count }, (_, i) => {
      const e = byEngagement[i];
      const m = byImpressions[i];
      return row(i + 4, [e?.url ?? null, e?.date ?? null, e?.value ?? null, null, m?.url ?? null, m?.date ?? null, m?.value ?? null]);
    }),
  ];
  const sheets = [["검색", summary], [topSheetName, sheet(topRows)]];
  const workbookXml = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([name], i) => `<sheet name="${esc(name)}" r:id="rId${i + 3}" sheetId="${i + 1}"/>`).join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`;
  const shared = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((t) => `<si><t>${esc(t)}</t></si>`).join("")}</sst>`;
  return writeZip([
    { name: "xl/workbook.xml", data: Buffer.from(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(rels) },
    { name: "xl/sharedStrings.xml", data: Buffer.from(shared) },
    ...sheets.map(([, xml], i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(xml) })),
  ].map((e) => ({ ...e, stored: false })));
}

export const postUrl = (id) => `https://www.linkedin.com/posts/eunjae-tony-lee_pm-share-${id}-hGL3`;
