function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderHtml(deck) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1080, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; base-uri 'none'; form-action 'none'">
  <title>Instagram carousel preview</title>
  <link rel="stylesheet" href="./carousel.css">
  <script id="carousel-data" type="application/json">${safeJson(deck)}</script>
  <script src="./carousel.js" defer></script>
</head>
<body>
  <main id="carousel" aria-label="Instagram carousel"></main>
  <output id="carousel-qa" aria-hidden="true"></output>
</body>
</html>
`;
}

export function renderCaption(deck) {
  const hashtags = deck.caption.hashtags.map((tag) => `#${tag.replace(/^#+/, "")}`).join(" ");
  return `${deck.caption.body}\n\n${hashtags}\n`;
}

export function renderAltText(deck) {
  return `${deck.slides.map((slide) => `## ${slide.id}\n\n${slide.altText}`).join("\n\n")}\n`;
}
