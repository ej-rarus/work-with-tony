// Text inside HWPX <hp:t> elements. An <hp:t> holds text nodes mixed with
// child elements such as <hp:tab .../> and <hp:lineBreak/>, and it may be
// self-closing (<hp:t/>). Matching and editing work on decoded text nodes
// only, so a search can never hit an entity name, a tag, or an attribute.

// The self-closing branch comes first so `<hp:t/>` is consumed on its own
// instead of running on to the next `</hp:t>`.
export const T_SOURCE = String.raw`<hp:t\b[^>]*\/>|(<hp:t\b[^>]*>)([\s\S]*?)(<\/hp:t>)`;
export const LINESEG_SOURCE = String.raw`<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>`;
export const tRegex = () => new RegExp(T_SOURCE, "g");

// Characters XML 1.0 cannot hold, plus tab (Hancom stores tabs as <hp:tab/>).
export const INVALID_TEXT = /[\u0000-\u0009\u000B\u000C\u000E-\u001F￾￿]/;
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;

export const escapeXml = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const decodeXml = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// Split the inside of an <hp:t> into text nodes (even indices) and tags (odd).
const splitNodes = (inner) => inner.split(/(<[^>]+>)/);

const tagText = (tag) => (/^<hp:lineBreak\b/.test(tag) ? "\n" : /^<hp:tab\b/.test(tag) ? "\t" : "");

export function innerText(inner) {
  return splitNodes(inner).map((part, i) => (i % 2 ? tagText(part) : decodeXml(part))).join("");
}

export function textNodes(inner) {
  return splitNodes(inner).filter((_, i) => i % 2 === 0).map(decodeXml);
}

// Apply `edit` to each decoded text node; unchanged nodes keep their original
// encoding byte for byte. Returns the new inner XML and whether anything changed.
export function editNodes(inner, edit) {
  let changed = false;
  const parts = splitNodes(inner).map((part, i) => {
    if (i % 2) return part;
    const before = decodeXml(part);
    const after = edit(before);
    if (after === before) return part;
    changed = true;
    return escapeXml(after);
  });
  return { inner: parts.join(""), changed };
}

const ENTITY_PROBLEM = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
const TAG = /<(\/?)([A-Za-z_][\w:.-]*)(?:\s[^>]*?)?(\/?)>/g;

// A light well-formedness check: legal characters, valid entities, and
// balanced tags. Used to compare a section before and after an edit.
export function xmlProblem(xml) {
  if (INVALID_XML.test(xml)) return "illegal control character";
  if (ENTITY_PROBLEM.test(xml)) return "unescaped &";
  const stack = [];
  for (const [, slash, name, selfClose] of xml.matchAll(TAG)) {
    if (selfClose) continue;
    if (!slash) {
      stack.push(name);
    } else if (stack.pop() !== name) {
      return `unbalanced </${name}>`;
    }
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : null;
}
