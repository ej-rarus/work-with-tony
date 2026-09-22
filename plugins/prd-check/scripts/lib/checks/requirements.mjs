import { finding, normalizeHeader, sectionByNumber, tablesUnder } from "../findings.mjs";

function columnIndex(headers, name) {
  const target = normalizeHeader(name);
  return headers.findIndex((h) => normalizeHeader(h) === target);
}

function cell(row, index) {
  return index === -1 ? undefined : (row.cells[index] ?? "").trim();
}

function weakness(text, phrases) {
  const stripped = text.replace(/[.。!]+$/, "").replace(/(한다|합니다|함|됨|됩니다)$/, "").trim();
  if (phrases.some((p) => stripped === p || stripped === p.replace(/\s+/g, ""))) return "error";
  if (phrases.some((p) => text.includes(p))) return "review";
  return null;
}

function checkRow(row, cols, rules, seen, idRegex) {
  const rt = rules.requirementTable;
  const out = [];
  const id = cell(row, cols.id);
  if (id !== undefined && !idRegex.test(id)) {
    out.push(finding("requirements.id", "error", row.line, `ID "${id}"가 형식 ${rt.idPattern}에 맞지 않습니다.`, "템플릿의 ID 형식을 따르세요."));
  }
  if (id !== undefined && seen.has(id)) {
    out.push(finding("requirements.duplicate", "error", row.line, `ID "${id}"가 중복됩니다.`, "각 요구사항에 고유한 ID를 주세요."));
  }
  const requirement = cell(row, cols.requirement);
  if (requirement !== undefined && requirement === "") {
    out.push(finding("requirements.empty", "error", row.line, `${id ?? "행"}의 요구사항이 비어 있습니다.`, "주체·조건·동작·결과를 적으세요."));
  }
  const priority = cell(row, cols.priority);
  if (priority !== undefined && !rt.priorityValues.includes(priority)) {
    out.push(finding("requirements.priority", "error", row.line, `우선순위 "${priority}"는 허용값(${rt.priorityValues.join(" / ")})이 아닙니다.`, "허용된 우선순위 중 하나로 바꾸세요."));
  }
  const status = cell(row, cols.status);
  if (status !== undefined && !rt.statusValues.includes(status)) {
    out.push(finding("requirements.status", "error", row.line, `확정 상태 "${status}"는 허용값(${rt.statusValues.join(" / ")})이 아닙니다.`, "허용된 상태값 중 하나로 바꾸세요."));
  }
  const criteria = cell(row, cols.criteria);
  if (criteria !== undefined && criteria === "") {
    out.push(finding("requirements.criteria.empty", "error", row.line, `${id ?? "행"}의 완료 기준이 비어 있습니다.`, "어떤 조건에서 어떤 결과를 확인할지 적으세요."));
  } else if (criteria) {
    const level = weakness(criteria, rt.weakCriteria);
    if (level) {
      out.push(finding("requirements.criteria.weak", level, row.line, `${id ?? "행"}의 완료 기준 "${criteria}"은(는) 확인 가능한 조건과 결과가 부족합니다.`, "조건과 관찰 가능한 결과를 적으세요."));
    }
  }
  return out;
}

export function run(doc, _expectations, rules) {
  const rt = rules.requirementTable;
  const section = sectionByNumber(doc, rt.section);
  if (!section) return [];
  const table = tablesUnder(doc, section.index)[0];
  if (!table) return [];
  const cols = {
    id: columnIndex(table.headers, rt.idColumn),
    requirement: columnIndex(table.headers, rt.requirementColumn),
    priority: columnIndex(table.headers, rt.priorityColumn),
    status: columnIndex(table.headers, rt.statusColumn),
    criteria: columnIndex(table.headers, rt.criteriaColumn),
  };
  if (cols.id === -1) return [];
  const idRegex = new RegExp(rt.idPattern);
  const seen = new Set();
  return table.rows.flatMap((row) => {
    const out = checkRow(row, cols, rules, seen, idRegex);
    const id = cell(row, cols.id);
    if (id) seen.add(id);
    return out;
  });
}
