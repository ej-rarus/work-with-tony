import { readZip, writeZip } from "./zip.mjs";
import {
  INVALID_TEXT, LINESEG_SOURCE, T_SOURCE, editNodes, escapeRegex, escapeXml, innerText, tRegex, textNodes, xmlProblem,
} from "./text.mjs";

// Reads and edits table cells in HWPX section XML. Cells are addressed by the
// logical <hp:cellAddr> the document records (top-left of a merged block),
// never by their position inside <hp:tr>, so merged cells cannot shift a write
// into the wrong column. Every edit either changes exactly what was asked or
// throws, and verifyDocument checks the result against the plan.

const SECTION_RE = /^Contents\/section(\d+)\.xml$/;
const TAG_RE = /<(\/?)hp:(tbl|tc)\b[^>]*>/g;
const ELEMENT_RE = /<([A-Za-z_][\w.-]*:[\w.-]+|[A-Za-z_][\w.-]*)\b/g;
// Elements a plain text cell may contain. Anything else (fields, form
// controls, pictures, shapes) means `set` would destroy it.
const PLAIN_CELL = new Set([
  "hp:tc", "hp:subList", "hp:p", "hp:run", "hp:t", "hp:linesegarray", "hp:lineseg",
  "hp:cellAddr", "hp:cellSpan", "hp:cellSz", "hp:cellMargin", "hp:lineBreak", "hp:tab", "hp:nbSpace", "hp:fwSpace", "hp:hyphen",
]);
const BOX = "[□☐]";
const LABEL_END = "(?![가-힣A-Za-z0-9])";
const DEFAULT_MARK = "■";
const DEFAULT_P_OPEN = '<hp:p id="0" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">';
const MAX_RUNS_SHOWN = 30;
const MAX_RUN_CHARS = 80;

const HINTS = {
  NO_SECTION: "The package has no Contents/sectionN.xml. Save the form again from Hancom Office as HWPX.",
  BAD_XML: "Table tags in the section are not balanced. Open and re-save the file in Hancom Office.",
  CELL_NOT_FOUND: "Run `inspect` and use the row/col it prints; a merged block is addressed by its top-left cell.",
  CELL_HAS_OBJECTS: "This cell holds a nested table, field, form control, or object, so it cannot be replaced whole. Use check or find+replace for its own text, or fill the inner table's cells.",
  CHECK_NOT_FOUND: "No box (□) directly before that label in this cell. Check the label spelling against `inspect`.",
  CHECK_AMBIGUOUS: "More than one box has that label in this cell. Use a longer, unique label.",
  FIND_NOT_FOUND: "That exact text is not in this cell. Copy it from `inspect`, including spaces.",
  FIND_SPLIT: "The text crosses a formatting boundary inside the cell. Pick a find string that lies inside one of the listed runs.",
  FIND_AMBIGUOUS: "That text appears more than once in this cell. Include more surrounding text so it is unique.",
  BAD_PLAN: 'Each op needs table, row, col and exactly one of: set, check, or find+replace, with no control characters or tabs. Example: {"table":0,"row":1,"col":1,"set":"홍길동"}',
};

export class HwpFormError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "HwpFormError";
    this.code = code;
    this.hint = HINTS[code] ?? "";
    Object.assign(this, extra);
  }
}

export function loadHwpx(buf) {
  const entries = readZip(buf);
  const sections = entries
    .filter((e) => SECTION_RE.test(e.name))
    .map((e) => ({ name: e.name, order: Number(e.name.match(SECTION_RE)[1]), xml: e.data.toString("utf8") }))
    .sort((a, b) => a.order - b.order);
  if (sections.length === 0) throw new HwpFormError("NO_SECTION", "No section XML found in the HWPX package.");
  return { entries, sections };
}

export function saveHwpx(doc) {
  const byName = new Map(doc.sections.map((s) => [s.name, s.xml]));
  return writeZip(doc.entries.map((e) => (byName.has(e.name) ? { ...e, data: Buffer.from(byName.get(e.name), "utf8") } : e)));
}

// ---- reading ---------------------------------------------------------------

function paragraphText(pxml) {
  return [...pxml.matchAll(tRegex())].map(([, open, inner]) => (open ? innerText(inner) : "")).join("");
}

function cellText(own) {
  return [...own.matchAll(/<hp:p\b[^>]*>([\s\S]*?)<\/hp:p>/g)].map(([, body]) => paragraphText(body)).join("\n");
}

const attr = (xml, tag, name) => Number(xml.match(new RegExp(`<hp:${tag}\\b[^>]*\\b${name}="(\\d+)"`))?.[1] ?? NaN);

function removeRanges(xml, base, ranges) {
  return ranges
    .slice()
    .sort((a, b) => b[0] - a[0])
    .reduce((acc, [start, end]) => acc.slice(0, start - base) + acc.slice(end - base), xml);
}

const hasNonTextElements = (own) => [...own.matchAll(ELEMENT_RE)].some(([, name]) => !PLAIN_CELL.has(name));

function closeCell(open, end, xml, sectionIndex) {
  const cellXml = xml.slice(open.start, end);
  const own = removeRanges(cellXml, open.start, open.nested);
  return {
    row: attr(own, "cellAddr", "rowAddr"),
    col: attr(own, "cellAddr", "colAddr"),
    rowSpan: attr(own, "cellSpan", "rowSpan") || 1,
    colSpan: attr(own, "cellSpan", "colSpan") || 1,
    text: cellText(own),
    hasObjects: open.nested.length > 0 || hasNonTextElements(own),
    section: sectionIndex,
    nested: open.nested.map(([s, e]) => [s - open.start, e - open.start]),
    start: open.start,
    end,
    xml: cellXml,
  };
}

function scanSection(xml, sectionIndex, tables) {
  const stack = [];
  const top = () => stack.at(-1);
  for (const m of xml.matchAll(TAG_RE)) {
    const [tag, slash, kind] = m;
    const end = m.index + tag.length;
    if (!slash && kind === "tbl") {
      const parentCell = top()?.kind === "tc" ? top() : null;
      const table = { index: tables.length, section: sectionIndex, parentCell, cells: [] };
      tables.push(table);
      stack.push({ kind: "tbl", table, start: m.index });
    } else if (slash && kind === "tbl") {
      const open = stack.pop();
      if (open?.kind !== "tbl") throw new HwpFormError("BAD_XML", "Unbalanced </hp:tbl>.");
      if (top()?.kind === "tc") top().nested.push([open.start, end]);
    } else if (!slash && kind === "tc") {
      if (top()?.kind !== "tbl") throw new HwpFormError("BAD_XML", "<hp:tc> outside a table.");
      stack.push({ kind: "tc", start: m.index, nested: [], table: top().table });
    } else {
      const open = stack.pop();
      if (open?.kind !== "tc") throw new HwpFormError("BAD_XML", "Unbalanced </hp:tc>.");
      const cell = closeCell(open, end, xml, sectionIndex);
      open.address = { table: open.table.index, row: cell.row, col: cell.col };
      open.table.cells.push(cell);
    }
  }
  if (stack.length) throw new HwpFormError("BAD_XML", "Unclosed table or cell.");
}

export function parseTables(sections) {
  const tables = [];
  sections.forEach((section, i) => scanSection(section.xml, i, tables));
  return tables.map(({ parentCell, cells, ...table }) => ({
    ...table,
    parent: parentCell ? parentCell.address : null,
    rows: Math.max(0, ...cells.map((c) => c.row + c.rowSpan)),
    cols: Math.max(0, ...cells.map((c) => c.col + c.colSpan)),
    cells,
  }));
}

export function findCell(tables, table, row, col) {
  const cell = tables[table]?.cells.find((c) => c.row === row && c.col === col);
  if (!cell) throw new HwpFormError("CELL_NOT_FOUND", `No cell at table ${table}, row ${row}, col ${col}.`);
  return cell;
}

// ---- editing ---------------------------------------------------------------

// Split a cell's XML into its own runs and the nested tables it holds, so
// check/replace only ever see and change the cell's own text.
function ownSegments(cell) {
  const cuts = [...cell.nested].sort((a, b) => a[0] - b[0]);
  const { segments, pos } = cuts.reduce(
    (acc, [start, end]) => ({
      segments: [...acc.segments, { own: true, xml: cell.xml.slice(acc.pos, start) }, { own: false, xml: cell.xml.slice(start, end) }],
      pos: end,
    }),
    { segments: [], pos: 0 },
  );
  return [...segments, { own: true, xml: cell.xml.slice(pos) }];
}

const ownTextNodes = (cell) => ownSegments(cell)
  .filter((seg) => seg.own)
  .flatMap((seg) => [...seg.xml.matchAll(tRegex())])
  .flatMap(([, open, inner]) => (open ? textNodes(inner) : []));

const countMatches = (cell, re) => ownTextNodes(cell).reduce((n, node) => n + (node.match(re) ?? []).length, 0);

const ownRuns = (cell) => ownTextNodes(cell)
  .filter((text) => text.trim() !== "")
  .slice(0, MAX_RUNS_SHOWN)
  .map((text) => text.slice(0, MAX_RUN_CHARS));

// <hp:linesegarray> is the last child of <hp:p>, so the first one after a
// changed run is that paragraph's layout cache. Drop only those, so Hancom
// re-lays out the edited paragraphs and keeps every other line where it was.
// `pending` carries across segments when a nested table sits between the run
// and the end of its paragraph.
function editText(cell, re, replacement) {
  const runOrLineseg = new RegExp(`${T_SOURCE}|${LINESEG_SOURCE}`, "g");
  let pending = false;
  const editSegment = (xml) => xml.replace(runOrLineseg, (match, open, inner, close) => {
    if (match.startsWith("<hp:linesegarray")) {
      if (!pending) return match;
      pending = false;
      return "";
    }
    if (open === undefined) return match;
    const result = editNodes(inner, (text) => text.replace(re, () => replacement));
    pending = pending || result.changed;
    return open + result.inner + close;
  });
  return ownSegments(cell)
    .map((seg) => (seg.own ? editSegment(seg.xml) : seg.xml))
    .join("");
}

function setCell(cell, text) {
  const openTag = cell.xml.match(/<hp:subList\b[^>]*>/);
  const bodyStart = openTag.index + openTag[0].length;
  const bodyEnd = cell.xml.lastIndexOf("</hp:subList>");
  const body = cell.xml.slice(bodyStart, bodyEnd);
  const pOpen = body.match(/<hp:p\b[^>]*>/)?.[0] ?? DEFAULT_P_OPEN;
  const charPr = body.match(/<hp:run\b[^>]*\bcharPrIDRef="(\d+)"/)?.[1] ?? "0";
  const paragraphs = normalizeNewlines(text).split("\n").map((line) => (line === ""
    ? `${pOpen}<hp:run charPrIDRef="${charPr}"/></hp:p>`
    : `${pOpen}<hp:run charPrIDRef="${charPr}"><hp:t>${escapeXml(line)}</hp:t></hp:run></hp:p>`));
  return cell.xml.slice(0, bodyStart) + paragraphs.join("") + cell.xml.slice(bodyEnd);
}

const checkRegex = (label, flags = "g") => new RegExp(`${BOX}(?=\\s*${escapeRegex(label)}${LABEL_END})`, flags);

function checkCell(cell, label, mark = DEFAULT_MARK) {
  const re = checkRegex(label);
  const count = countMatches(cell, re);
  if (count === 0) throw new HwpFormError("CHECK_NOT_FOUND", `No box labelled "${label}".`);
  if (count > 1) throw new HwpFormError("CHECK_AMBIGUOUS", `${count} boxes labelled "${label}".`);
  return editText(cell, re, mark);
}

function replaceInCell(cell, find, replacement) {
  const re = new RegExp(escapeRegex(find), "g");
  const count = countMatches(cell, re);
  if (count === 0 && cell.text.includes(find)) {
    throw new HwpFormError("FIND_SPLIT", `"${find}" spans more than one text run in this cell.`, { runs: ownRuns(cell) });
  }
  if (count === 0) throw new HwpFormError("FIND_NOT_FOUND", `"${find}" not found in this cell.`);
  if (count > 1) throw new HwpFormError("FIND_AMBIGUOUS", `"${find}" appears ${count} times in this cell.`);
  return editText(cell, re, replacement);
}

const normalizeNewlines = (s) => String(s).replace(/\r\n?/g, "\n");
const isIndex = (n) => Number.isInteger(n) && n >= 0;
const isText = (v, { nonEmpty = false, newlines = false } = {}) => typeof v === "string"
  && (!nonEmpty || v.trim() !== "")
  && !INVALID_TEXT.test(newlines ? v : v.replace(/\n/g, "\u0001"));

export function validateOp(op) {
  const has = (k) => op && typeof op === "object" && k in op;
  const kinds = ["set", "check", "find"].filter(has).length;
  const ok = op && typeof op === "object"
    && isIndex(op.table) && isIndex(op.row) && isIndex(op.col) && kinds === 1
    && (!has("set") || isText(normalizeNewlines(op.set), { newlines: true }))
    && (!has("check") || isText(op.check, { nonEmpty: true }))
    && (!has("find") || (isText(op.find, { nonEmpty: true }) && isText(op.replace)))
    && (!has("mark") || isText(op.mark, { nonEmpty: true }));
  if (!ok) throw new HwpFormError("BAD_PLAN", `Invalid op: ${JSON.stringify(op)}`);
  return op;
}

function applyOp(sections, op) {
  const cell = findCell(parseTables(sections), op.table, op.row, op.col);
  // Replacing a whole cell would drop its nested table, field, or control;
  // partial edits (check, replace) leave them in place.
  if (cell.hasObjects && "set" in op) throw new HwpFormError("CELL_HAS_OBJECTS", `Cell ${op.table}/${op.row}/${op.col} contains a nested table, field, or object.`);
  const next = "set" in op ? setCell(cell, op.set)
    : "check" in op ? checkCell(cell, op.check, op.mark)
    : replaceInCell(cell, op.find, op.replace);
  return sections.map((s, i) => (i === cell.section ? { ...s, xml: s.xml.slice(0, cell.start) + next + s.xml.slice(cell.end) } : s));
}

export function applyOps(doc, ops) {
  if (!Array.isArray(ops) || ops.length === 0) throw new HwpFormError("BAD_PLAN", "The plan needs a non-empty ops array.");
  const sections = ops.reduce((acc, op, i) => {
    try {
      return applyOp(acc, validateOp(op));
    } catch (error) {
      if (error instanceof HwpFormError) throw new HwpFormError(error.code, error.message, { ...(error.runs ? { runs: error.runs } : {}), op: i });
      throw error;
    }
  }, doc.sections);
  return { ...doc, sections };
}

// ---- verification ----------------------------------------------------------

const keyOf = (t, r, c) => `${t}/${r}/${c}`;

// Every text a cell may legitimately hold after `op`, given what it could hold before.
function expectedAfter(candidates, op) {
  if ("set" in op) return [normalizeNewlines(op.set)];
  if ("check" in op) return candidates.map((text) => text.replace(checkRegex(op.check, ""), () => op.mark ?? DEFAULT_MARK));
  return candidates.flatMap((text) => {
    const variants = [];
    for (let at = text.indexOf(op.find); at !== -1; at = text.indexOf(op.find, at + 1)) {
      variants.push(text.slice(0, at) + op.replace + text.slice(at + op.find.length));
    }
    return variants;
  });
}

const cellMap = (tables) => new Map(tables.flatMap((t) => t.cells.map((c) => [keyOf(t.index, c.row, c.col), c.text])));

function sectionFailures(before, after) {
  return after.sections.flatMap((section, i) => {
    const problem = xmlProblem(section.xml);
    return problem && !xmlProblem(before.sections[i]?.xml ?? "") ? [{ reason: `section XML ${section.name}: ${problem}` }] : [];
  });
}

// Compares the document before and after the plan: every planned cell must
// hold exactly the expected text, every other cell must be unchanged, and the
// edited sections must stay well formed. Returns per-op results with a
// `failures` list attached.
export function verifyDocument(before, after, ops) {
  const beforeCells = cellMap(parseTables(before.sections));
  let afterCells;
  try {
    afterCells = cellMap(parseTables(after.sections));
  } catch (error) {
    const failures = [{ reason: `section XML: ${error.message}` }];
    return Object.assign(ops.map((op) => ({ table: op.table, row: op.row, col: op.col, ok: false, text: "" })), { failures });
  }
  const expected = ops.reduce((acc, op) => {
    const key = keyOf(op.table, op.row, op.col);
    const current = acc.get(key) ?? [beforeCells.get(key) ?? ""];
    return new Map(acc).set(key, expectedAfter(current, op));
  }, new Map());
  const results = ops.map((op) => {
    const text = afterCells.get(keyOf(op.table, op.row, op.col)) ?? "";
    return { table: op.table, row: op.row, col: op.col, ok: expected.get(keyOf(op.table, op.row, op.col)).includes(text), text };
  });
  const opFailures = results.filter((r) => !r.ok).map(({ table, row, col }) => ({ table, row, col, reason: "text does not match the plan" }));
  const strayFailures = [...new Set([...beforeCells.keys(), ...afterCells.keys()])]
    .filter((key) => !expected.has(key) && beforeCells.get(key) !== afterCells.get(key))
    .map((key) => {
      const [table, row, col] = key.split("/").map(Number);
      return { table, row, col, reason: "changed but not in the plan" };
    });
  const failures = [...sectionFailures(before, after), ...opFailures, ...strayFailures];
  return Object.assign(results, { failures });
}
