import { finding } from "../findings.mjs";

function missingFindings(doc, expectations) {
  const present = new Set(doc.headings.map((h) => h.number).filter(Boolean));
  let lastFoundLine = 1;
  const out = [];
  for (const section of expectations.sections) {
    if (present.has(section.number)) {
      lastFoundLine = doc.headings.find((h) => h.number === section.number).line;
      continue;
    }
    if (section.optional) continue;
    out.push(finding("structure.missing", "error", lastFoundLine,
      `${section.number} ${section.title} 절이 없습니다.`,
      `템플릿의 "${section.number} ${section.title}" 절을 같은 위치에 추가하세요.`));
  }
  return out;
}

function orderFindings(doc, expectations) {
  const rank = new Map(expectations.sections.map((s, i) => [s.number, i]));
  let highest = -1;
  const out = [];
  for (const h of doc.headings) {
    if (!h.number || !rank.has(h.number)) continue;
    const r = rank.get(h.number);
    if (r < highest) {
      out.push(finding("structure.order", "error", h.line,
        `${h.number} ${h.title} 절이 템플릿 순서와 다른 위치에 있습니다.`,
        "템플릿의 장·절 순서대로 옮기세요."));
    } else {
      highest = r;
    }
  }
  return out;
}

function extraFindings(doc, expectations) {
  const known = new Set(expectations.sections.map((s) => s.number));
  return doc.headings
    .filter((h) => h.number && !known.has(h.number))
    .map((h) => finding("structure.extra", "review", h.line,
      `${h.number} ${h.title} 절은 템플릿에 없습니다.`,
      "프로젝트에 꼭 필요한 절인지 확인하고, 아니면 해당 내용을 표준 절로 옮기세요."));
}

export function run(doc, expectations, rules) {
  return [...missingFindings(doc, expectations), ...orderFindings(doc, expectations), ...extraFindings(doc, expectations)];
}
