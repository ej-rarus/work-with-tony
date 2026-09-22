export function finding(rule, severity, line, message, fix) {
  return { rule, severity, line, message, fix };
}

export function normalizeHeader(s) {
  return String(s).trim().replace(/\s+/g, " ").replace(/\s*([·/])\s*/g, "$1");
}

export function sameHeaders(a, b) {
  if (a.length !== b.length) return false;
  return a.every((h, i) => normalizeHeader(h) === normalizeHeader(b[i]));
}

export function sectionByNumber(doc, number) {
  const index = doc.headings.findIndex((h) => h.number === number);
  return index === -1 ? null : { heading: doc.headings[index], index };
}

export function tablesUnder(doc, headingIndex) {
  return doc.tables.filter((t) => t.headingIndex === headingIndex);
}
