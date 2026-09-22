import { finding, normalizeHeader, sameHeaders, sectionByNumber, tablesUnder } from "../findings.mjs";

function diffColumns(expected, actual) {
  const exp = expected.map(normalizeHeader);
  const act = actual.map(normalizeHeader);
  const missing = exp.filter((c) => !act.includes(c));
  const unexpected = act.filter((c) => !exp.includes(c));
  return { missing, unexpected };
}

function describe(section, expected, actual) {
  const { missing, unexpected } = diffColumns(expected, actual);
  const parts = [];
  if (missing.length) parts.push(`빠진 열: ${missing.join(", ")}`);
  if (unexpected.length) parts.push(`템플릿에 없는 열: ${unexpected.join(", ")}`);
  if (!parts.length) parts.push("열 순서가 다릅니다");
  return `${section.number} ${section.title} 표의 헤더가 템플릿과 다릅니다. ${parts.join(" / ")}`;
}

export function run(doc, expectations, rules) {
  const out = [];
  for (const section of expectations.sections) {
    if (!section.tables.length) continue;
    const found = sectionByNumber(doc, section.number);
    if (!found) continue;
    const actual = tablesUnder(doc, found.index);
    section.tables.forEach((expected, i) => {
      const table = actual[i];
      if (!table) {
        out.push(finding("tables.missing", "error", found.heading.line,
          `${section.number} ${section.title} 절에 표가 없습니다. 템플릿 열: ${expected.join(" | ")}`,
          "템플릿의 표 헤더를 그대로 두고 행을 채우세요."));
        return;
      }
      if (!sameHeaders(expected, table.headers)) {
        out.push(finding("tables.header", "error", table.line, describe(section, expected, table.headers),
          `헤더를 "${expected.join(" | ")}"로 맞추세요.`));
      }
    });
  }
  return out;
}
