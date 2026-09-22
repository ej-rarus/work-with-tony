const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const NUMBERED = /^(\d+(?:\.\d+)*)\.?\s+(.*)$/;
const SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const FENCE = /^\s*(```|~~~)/;
const OPTIONAL_START = /^\s*<!--\s*optional:start\s*-->\s*$/;
const OPTIONAL_END = /^\s*<!--\s*optional:end\s*-->\s*$/;
const COMMENT = /^\s*<!--.*-->\s*$/;

function splitCells(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function parseHeading(raw, level, line) {
  const m = NUMBERED.exec(raw);
  return m
    ? { line, level, number: m[1], title: m[2].trim(), raw }
    : { line, level, number: null, title: raw.trim(), raw };
}

function isTableStart(lines, i) {
  return lines[i].trim().startsWith("|") && i + 1 < lines.length && SEPARATOR.test(lines[i + 1]);
}

function readTable(lines, start, headingIndex) {
  const headers = splitCells(lines[start]);
  const rows = [];
  let i = start + 2;
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    rows.push({ line: i + 1, cells: splitCells(lines[i]) });
    i += 1;
  }
  return { table: { line: start + 1, headers, rows, headingIndex }, next: i };
}

export function parseMarkdown(text) {
  const lines = String(text).replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  const headings = [];
  const tables = [];
  const paragraphs = [];
  const optionalRanges = [];
  let inFence = false;
  let openOptional = null;
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (FENCE.test(raw)) { inFence = !inFence; i += 1; continue; }
    if (inFence) { i += 1; continue; }
    if (OPTIONAL_START.test(raw)) { openOptional = lineNo; i += 1; continue; }
    if (OPTIONAL_END.test(raw)) {
      if (openOptional !== null) optionalRanges.push({ start: openOptional, end: lineNo });
      openOptional = null;
      i += 1;
      continue;
    }
    if (COMMENT.test(raw) || raw.trim() === "") { i += 1; continue; }
    const h = HEADING.exec(raw);
    if (h) { headings.push(parseHeading(h[2], h[1].length, lineNo)); i += 1; continue; }
    const headingIndex = headings.length - 1;
    if (isTableStart(lines, i)) {
      const { table, next } = readTable(lines, i, headingIndex);
      tables.push(table);
      i = next;
      continue;
    }
    paragraphs.push({ line: lineNo, text: raw.trim(), headingIndex });
    i += 1;
  }
  return { lines, headings, tables, paragraphs, optionalRanges };
}
