import { normalizeHeader, sectionByNumber, tablesUnder } from "./findings.mjs";

export const SKILL_MARKER = "<!-- skill-review -->";

function firstTable(doc, number) {
  const section = sectionByNumber(doc, number);
  return section ? tablesUnder(doc, section.index)[0] ?? null : null;
}

function col(table, name) {
  const target = normalizeHeader(name);
  return table.headers.findIndex((h) => normalizeHeader(h) === target);
}

function pick(row, index) {
  return index === -1 ? "" : (row.cells[index] ?? "").trim();
}

function requirementRows(doc, rules) {
  const rt = rules.requirementTable;
  const table = firstTable(doc, rt.section);
  if (!table) return [];
  const c = {
    id: col(table, rt.idColumn), requirement: col(table, rt.requirementColumn), priority: col(table, rt.priorityColumn),
    status: col(table, rt.statusColumn), criteria: col(table, rt.criteriaColumn),
  };
  return table.rows.map((row) => ({
    line: row.line, id: pick(row, c.id), requirement: pick(row, c.requirement), priority: pick(row, c.priority),
    status: pick(row, c.status), criteria: pick(row, c.criteria),
  }));
}

function scopeRows(doc, number) {
  const table = firstTable(doc, number);
  if (!table) return [];
  return table.rows.map((row) => ({ line: row.line, area: pick(row, 0), detail: pick(row, 1) }));
}

function openItemRows(doc, rules) {
  const table = firstTable(doc, rules.openItemsSection);
  if (!table) return [];
  return table.rows.map((row) => ({ line: row.line, question: pick(row, 0), scope: pick(row, 1), owner: pick(row, 2), due: pick(row, 3) }));
}

export function buildStructure(doc, rules) {
  return {
    sections: doc.headings.filter((h) => h.number).map((h) => ({ number: h.number, title: h.title, line: h.line })),
    requirements: requirementRows(doc, rules),
    scope: { included: scopeRows(doc, "3.1"), excluded: scopeRows(doc, "3.2") },
    openItems: openItemRows(doc, rules),
  };
}

export function buildResult({ file, template, rules, doc, findings, rulesObject }) {
  const sorted = [...findings].sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return {
    ok: true,
    file,
    template,
    rules,
    summary: {
      lines: doc.lines.length - (doc.lines[doc.lines.length - 1] === "" ? 1 : 0),
      errorCount: sorted.filter((f) => f.severity === "error").length,
      reviewCount: sorted.filter((f) => f.severity === "review").length,
    },
    findings: sorted,
    structure: buildStructure(doc, rulesObject),
  };
}

export function toJson(result) {
  return JSON.stringify(result);
}

function escapeCell(text) {
  return String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function table(rows, lastHeader) {
  if (!rows.length) return "없음\n";
  const head = `| 줄 | 규칙 | 내용 | ${lastHeader} |\n| --- | --- | --- | --- |\n`;
  return head + rows.map((f) => `| ${f.line} | ${f.rule} | ${escapeCell(f.message)} | ${escapeCell(f.fix)} |`).join("\n") + "\n";
}

export function toMarkdown(result, { date }) {
  const errors = result.findings.filter((f) => f.severity === "error");
  const reviews = result.findings.filter((f) => f.severity === "review");
  return [
    "# PRD 검사 결과",
    "",
    `- 대상: ${result.file} (${result.summary.lines}줄)`,
    `- 템플릿: ${result.template} · 규칙: ${result.rules}`,
    `- 검사일: ${date} · 오류 ${result.summary.errorCount} · 확인 ${result.summary.reviewCount}`,
    "",
    "## 오류",
    "",
    table(errors, "조치"),
    "## 확인",
    "",
    table(reviews, "판단 근거"),
    SKILL_MARKER,
    "",
  ].join("\n");
}
