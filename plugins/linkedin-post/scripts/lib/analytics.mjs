// Reads LinkedIn's personal "AggregateAnalytics" export and summarises
// recorded post stats. The export's top-posts sheet holds two side-by-side
// tables, one ranked by engagements and one by impressions; posts are joined
// by the numeric id that also appears in our published `url:`.

const HINTS = {
  NOT_AN_EXPORT: "Use the file from LinkedIn > Analytics > Content/Posts > Export (AggregateAnalytics_….xlsx). No top-posts table was found in this workbook.",
};

export class StatsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StatsError";
    this.code = code;
    this.hint = HINTS[code] ?? "";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SMALL_SAMPLE = 3;
const TOP_N = 3;
const RATE_DIGITS = 4;

export function postId(url) {
  const match = String(url ?? "").match(/(?:urn:li:(?:share|activity|ugcPost):|[-_](?:share|activity|ugcPost)-)(\d+)/);
  return match ? match[1] : null;
}

const pad = (n) => String(n).padStart(2, "0");

function datesIn(text) {
  const s = String(text ?? "");
  const korean = [...s.matchAll(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/g)].map(([, y, m, d]) => `${y}-${pad(m)}-${pad(d)}`);
  if (korean.length) return korean;
  const us = [...s.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].map(([, m, d, y]) => `${y}-${pad(m)}-${pad(d)}`);
  if (us.length) return us;
  return [...s.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)].map(([iso]) => iso);
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function exportRange(book) {
  for (const sheet of book.sheets) {
    for (const row of sheet.rows) {
      for (const cell of row) {
        const dates = datesIn(cell);
        if (dates.length === 2) return { rangeStart: dates[0], rangeEnd: dates[1], rangeDays: daysBetween(dates[0], dates[1]) + 1 };
      }
    }
  }
  return { rangeStart: null, rangeEnd: null, rangeDays: null };
}

const metricKind = (header) => (/노출|impression/i.test(header ?? "") ? "impressions"
  : /참여|engagement/i.test(header ?? "") ? "engagements"
  : null);

// Header row: a URL column followed by a date column and a metric column.
function findTables(rows) {
  for (let r = 0; r < rows.length; r += 1) {
    const tables = rows[r]
      .map((cell, c) => ({ c, kind: /URL/i.test(cell ?? "") ? metricKind(rows[r][c + 2]) : null }))
      .filter((t) => t.kind);
    if (tables.length) return { headerRow: r, tables };
  }
  return null;
}

const toCount = (value) => {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

export function parseTopPosts(book) {
  const found = book.sheets.map((sheet) => findTables(sheet.rows) && { sheet, ...findTables(sheet.rows) }).find(Boolean);
  if (!found) throw new StatsError("NOT_AN_EXPORT", "No top-posts table (post URL + impressions/engagements) found.");
  const posts = new Map();
  for (const row of found.sheet.rows.slice(found.headerRow + 1)) {
    for (const { c, kind } of found.tables) {
      const id = postId(row[c]);
      const value = toCount(row[c + 2]);
      if (!id || value === undefined) continue;
      const previous = posts.get(id) ?? { id, url: row[c], date: datesIn(row[c + 1])[0] ?? null };
      posts.set(id, { ...previous, [kind]: value });
    }
  }
  return { ...exportRange(book), posts: [...posts.values()] };
}

// ---- aggregation -----------------------------------------------------------

const mean = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

function engagementRate(posts) {
  const both = posts.filter((p) => typeof p.stats.engagements === "number" && p.stats.impressions > 0);
  if (!both.length) return null;
  const engaged = both.reduce((n, p) => n + p.stats.engagements, 0);
  const seen = both.reduce((n, p) => n + p.stats.impressions, 0);
  const scale = 10 ** RATE_DIGITS;
  return Math.round((engaged / seen) * scale) / scale;
}

function summarize(posts) {
  const impressions = posts.map((p) => p.stats.impressions);
  return { posts: posts.length, impressionsMean: mean(impressions), impressionsMedian: median(impressions), engagementRate: engagementRate(posts) };
}

function groupBy(posts, field) {
  const groups = posts.reduce((acc, p) => {
    const key = p[field] || "(none)";
    return { ...acc, [key]: [...(acc[key] ?? []), p] };
  }, {});
  return Object.entries(groups)
    .map(([key, list]) => ({ key, ...summarize(list), small: list.length < SMALL_SAMPLE }))
    .sort((a, b) => b.impressionsMean - a.impressionsMean);
}

const brief = ({ file, date, structure, type, stats }) => ({ file, date, structure, type, impressions: stats.impressions, engagements: stats.engagements });

// posts: [{ file, date, structure, type, stats? }]. A post counts once its
// stats were checked at least `minAgeDays` after publishing; younger posts
// are still collecting impressions and would drag averages down.
export function aggregate(posts, { minAgeDays = 3 } = {}) {
  const withStats = posts.filter((p) => typeof p.stats?.impressions === "number");
  const noStats = posts.filter((p) => !withStats.includes(p)).map((p) => p.file);
  const age = (p) => (p.stats.checked && p.date ? daysBetween(p.date, p.stats.checked) : Infinity);
  const young = withStats.filter((p) => age(p) < minAgeDays);
  const mature = withStats.filter((p) => !young.includes(p));
  const ranked = [...mature].sort((a, b) => b.stats.impressions - a.stats.impressions);
  return {
    minAgeDays,
    overall: mature.length ? summarize(mature) : { posts: 0 },
    byStructure: groupBy(mature, "structure"),
    byType: groupBy(mature, "type"),
    top: ranked.slice(0, TOP_N).map(brief),
    bottom: ranked.slice(-TOP_N).reverse().map(brief),
    young: young.map((p) => p.file),
    noStats,
  };
}
