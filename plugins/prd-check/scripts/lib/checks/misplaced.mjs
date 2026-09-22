import { finding, normalizeHeader } from "../findings.mjs";

function includesAll(headers, needles) {
  return needles.every((n) => headers.some((h) => h.includes(normalizeHeader(n))));
}

function includesAny(headers, needles) {
  return needles.some((n) => headers.some((h) => h.includes(normalizeHeader(n))));
}

function sectionNumberOf(doc, table) {
  return table.headingIndex === -1 ? null : doc.headings[table.headingIndex].number;
}

function isOpenItemsTable(headers, rules) {
  return includesAll(headers, rules.openItemsHeaders);
}

function matchesSignature(headers, sig) {
  const allOk = sig.allOf ? includesAll(headers, sig.allOf) : true;
  const anyOk = sig.anyOf ? includesAny(headers, sig.anyOf) : true;
  return allOk && anyOk;
}

export function run(doc, _expectations, rules) {
  const out = [];
  for (const table of doc.tables) {
    const headers = table.headers.map(normalizeHeader);
    const section = sectionNumberOf(doc, table);
    if (isOpenItemsTable(headers, rules)) {
      if (section !== rules.openItemsSection) {
        out.push(finding("misplaced.openItems", "error", table.line,
          `미확정 사항 표가 ${rules.openItemsSection} 밖(${section ?? "절 없음"})에 있습니다.`,
          `미확정 사항은 ${rules.openItemsSection} 절 한 곳에만 두세요.`));
      }
      continue;
    }
    for (const sig of rules.misplacedTableSignatures) {
      if (matchesSignature(headers, sig)) {
        out.push(finding(`misplaced.${sig.name}`, "error", table.line,
          `PRD에 두지 않는 표(${sig.name})가 ${section ?? "절 없음"}에 있습니다.`,
          "일정·결정 로그·태스크 상태는 WBS나 별도 문서에서 관리하고 PRD에서는 빼세요."));
        break;
      }
    }
  }
  return out;
}
