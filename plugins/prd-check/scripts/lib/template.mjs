function isInside(line, ranges) {
  return ranges.some((r) => line > r.start && line < r.end);
}

export function extractExpectations(doc) {
  const sections = doc.headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => heading.number !== null)
    .map(({ heading, index }) => ({
      number: heading.number,
      title: heading.title,
      level: heading.level,
      optional: isInside(heading.line, doc.optionalRanges),
      tables: doc.tables.filter((t) => t.headingIndex === index).map((t) => [...t.headers]),
    }));
  return { sections };
}
