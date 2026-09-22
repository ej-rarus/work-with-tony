import { finding, sectionByNumber, tablesUnder } from "../findings.mjs";

function isPlaceholder(text, pattern) {
  return pattern.test(String(text).trim());
}

function cellFindings(doc, pattern) {
  return doc.tables.flatMap((t) => t.rows.flatMap((row) =>
    row.cells.filter((c) => isPlaceholder(c, pattern)).map((c) =>
      finding("placeholders.remaining", "error", row.line, `입력칸 "${c}"이(가) 남아 있습니다.`, "실제 내용을 적거나 필요 없는 행은 지우세요."))));
}

function paragraphFindings(doc, pattern) {
  return doc.paragraphs
    .filter((p) => isPlaceholder(p.text, pattern))
    .map((p) => finding("placeholders.remaining", "error", p.line, `입력칸 "${p.text}"이(가) 남아 있습니다.`, "실제 내용을 적거나 필요 없는 문단은 지우세요."));
}

function infoFindings(doc, rules, pattern) {
  const section = sectionByNumber(doc, rules.requiredInfoSection);
  if (!section) return [];
  const table = tablesUnder(doc, section.index)[0];
  if (!table) return [];
  return table.rows
    .filter((row) => row.cells.length >= 2 && (row.cells[1].trim() === "" || isPlaceholder(row.cells[1], pattern)))
    .map((row) => finding("placeholders.info", "error", row.line, `${rules.requiredInfoSection} 기본 정보의 "${row.cells[0]}" 값이 비어 있습니다.`, "표지와 기본 정보의 값을 채우세요."));
}

export function run(doc, _expectations, rules) {
  const pattern = new RegExp(rules.placeholderPattern);
  const info = infoFindings(doc, rules, pattern);
  const infoLines = new Set(info.map((f) => f.line));
  const cells = cellFindings(doc, pattern).filter((f) => !infoLines.has(f.line));
  return [...cells, ...paragraphFindings(doc, pattern), ...info].sort((a, b) => a.line - b.line);
}
