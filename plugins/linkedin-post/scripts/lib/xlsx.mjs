import { readZip } from "./zip.mjs";

// Minimal .xlsx reader: sheet names in workbook order and each sheet's cells
// as strings. Enough for LinkedIn's analytics export; formulas, styles, and
// dates stored as serial numbers are returned as their raw text.

const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const textOf = (xml) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(([, t]) => decode(t)).join("");

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

function columnIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  for (const [, rowTag, body] of xml.matchAll(/(<row\b[^>]*>)([\s\S]*?)<\/row>/g)) {
    const rowIndex = Number(attr(rowTag, "r")) - 1;
    const cells = [];
    for (const [, cellTag, inner = ""] of body.matchAll(/(<c\b[^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cellTag, "r");
      if (!ref) continue;
      const type = attr(cellTag, "t");
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const value = type === "s" ? shared[Number(raw)]
        : type === "inlineStr" ? textOf(inner)
        : raw === undefined ? undefined : decode(raw);
      if (value !== undefined) cells[columnIndex(ref)] = value;
    }
    rows[rowIndex] = cells;
  }
  return Array.from({ length: rows.length }, (_, i) => rows[i] ?? []);
}

export function readWorkbook(buf) {
  const files = new Map(readZip(buf).map((e) => [e.name, e.data.toString("utf8")]));
  const workbook = files.get("xl/workbook.xml");
  if (!workbook) {
    const error = new Error("Not an .xlsx workbook (xl/workbook.xml missing).");
    error.code = "BAD_ZIP";
    throw error;
  }
  const rels = new Map([...(files.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)]
    .map(([tag]) => [attr(tag, "Id"), attr(tag, "Target")]));
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, si]) => textOf(si));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => {
    const target = rels.get(attr(tag, "r:id")) ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    return { name: decode(attr(tag, "name") ?? ""), rows: parseSheet(files.get(path) ?? "", shared) };
  });
  return { sheets };
}
