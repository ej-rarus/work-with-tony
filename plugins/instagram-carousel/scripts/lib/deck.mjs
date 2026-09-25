import path from "node:path";

import { readAsset } from "./input.mjs";

const LAYOUTS = new Set(["cover", "scene", "compare", "checklist", "prompt", "statement", "close"]);
const POSITIONS = new Set(["center", "top", "bottom", "left", "right"]);
const FITS = new Set(["cover", "contain"]);

export class DeckError extends Error {
  constructor(message, code = "INVALID_DECK") {
    super(message);
    this.name = "DeckError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function object(value, label) {
  if (!isPlainObject(value)) throw new DeckError(`${label} must be a plain JSON object.`);
  return value;
}

function allowed(value, fields, label) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) throw new DeckError(`${label} has unknown field: ${key}.`);
  }
}

function string(value, label, max, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string") throw new DeckError(`${label} must be a string.`);
  if (value.trim().length === 0) throw new DeckError(`${label} cannot be empty.`);
  if ([...value].length > max) throw new DeckError(`${label} exceeds ${max} characters.`);
  return value;
}

function optionalString(value, label, max) {
  return string(value, label, max, { optional: true });
}

function canonicalObject(entries) {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

function normalizeMeta(raw) {
  const value = object(raw, "meta");
  const keys = new Set(["brand", "handle", "series", "issue", "title"]);
  allowed(value, keys, "meta");
  return {
    brand: string(value.brand, "meta.brand", 80),
    handle: string(value.handle, "meta.handle", 80),
    series: string(value.series, "meta.series", 80),
    issue: string(value.issue, "meta.issue", 20),
    title: string(value.title, "meta.title", 100)
  };
}

const BASE_SLIDE_KEYS = ["id", "layout", "title", "altText"];
const LAYOUT_KEYS = {
  cover: ["body"],
  scene: ["body", "note", "assetId"],
  compare: ["body", "before", "after"],
  checklist: ["body", "items"],
  prompt: ["body", "prompt"],
  statement: ["body", "note"],
  close: ["body", "next", "assetId"]
};

function normalizeSlide(raw, index, template) {
  const value = object(raw, `slides[${index}]`);
  const layout = string(value.layout, `slides[${index}].layout`, 20);
  if (!LAYOUTS.has(layout)) throw new DeckError(`slides[${index}].layout is not supported.`);
  const editorialCover = layout === "cover" && template === "editorial-blue";
  if (layout === "cover" && !editorialCover && Object.hasOwn(value, "assetId")) {
    throw new DeckError("The cover layout cannot use an asset.");
  }
  allowed(value, new Set([...BASE_SLIDE_KEYS, ...LAYOUT_KEYS[layout], ...(editorialCover ? ["assetId"] : [])]), `slides[${index}]`);

  const expectedId = String(index + 1).padStart(2, "0");
  const id = string(value.id, `slides[${index}].id`, 2);
  if (id !== expectedId) throw new DeckError(`slides[${index}].id must be ${expectedId}.`);

  const base = {
    id,
    layout,
    title: string(value.title, `slides[${index}].title`, 50),
    altText: string(value.altText, `slides[${index}].altText`, 500)
  };
  const body = optionalString(value.body, `slides[${index}].body`, 240);

  if (layout === "cover") {
    return canonicalObject([...Object.entries(base), ["body", body], ["assetId", optionalString(value.assetId, `slides[${index}].assetId`, 40)]]);
  }
  if (layout === "scene") {
    return canonicalObject([...Object.entries(base), ["body", body], ["note", optionalString(value.note, `slides[${index}].note`, 120)], ["assetId", optionalString(value.assetId, `slides[${index}].assetId`, 40)]]);
  }
  if (layout === "compare") {
    return canonicalObject([...Object.entries(base), ["body", body], ["before", string(value.before, `slides[${index}].before`, 180)], ["after", string(value.after, `slides[${index}].after`, 180)]]);
  }
  if (layout === "checklist") {
    if (!Array.isArray(value.items) || value.items.length < 2 || value.items.length > 6) {
      throw new DeckError(`slides[${index}].items must contain 2 to 6 items.`);
    }
    const items = value.items.map((item, itemIndex) => string(item, `slides[${index}].items[${itemIndex}]`, 100));
    return canonicalObject([...Object.entries(base), ["body", body], ["items", items]]);
  }
  if (layout === "prompt") {
    return canonicalObject([...Object.entries(base), ["body", body], ["prompt", string(value.prompt, `slides[${index}].prompt`, 800)]]);
  }
  if (layout === "statement") {
    return canonicalObject([...Object.entries(base), ["body", body], ["note", optionalString(value.note, `slides[${index}].note`, 120)]]);
  }
  return canonicalObject([...Object.entries(base), ["body", body], ["next", optionalString(value.next, `slides[${index}].next`, 80)], ["assetId", optionalString(value.assetId, `slides[${index}].assetId`, 40)]]);
}

function normalizeCandidateAsset(raw, index) {
  const value = object(raw, `assets[${index}]`);
  allowed(value, new Set(["id", "path", "alt", "fit", "position"]), `assets[${index}]`);
  const fit = value.fit ?? "cover";
  const position = value.position ?? "center";
  if (!FITS.has(fit)) throw new DeckError(`assets[${index}].fit must be cover or contain.`);
  if (!POSITIONS.has(position)) throw new DeckError(`assets[${index}].position is not supported.`);
  return {
    id: string(value.id, `assets[${index}].id`, 40),
    path: string(value.path, `assets[${index}].path`, 4096),
    alt: string(value.alt, `assets[${index}].alt`, 500),
    fit,
    position
  };
}

function normalizeCanonicalAsset(raw, index) {
  const value = object(raw, `assets[${index}]`);
  allowed(value, new Set(["id", "file", "alt", "fit", "position", "mediaType", "sha256", "originalName"]), `assets[${index}]`);
  const file = string(value.file, `assets[${index}].file`, 160);
  if (!/^assets\/[a-f0-9]{16}\.(png|jpg|webp)$/.test(file)) throw new DeckError(`assets[${index}].file is not canonical.`);
  const mediaType = string(value.mediaType, `assets[${index}].mediaType`, 20);
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(mediaType)) throw new DeckError(`assets[${index}].mediaType is not supported.`);
  const sha256 = string(value.sha256, `assets[${index}].sha256`, 64);
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new DeckError(`assets[${index}].sha256 must be lowercase SHA-256.`);
  const fit = value.fit ?? "cover";
  const position = value.position ?? "center";
  if (!FITS.has(fit) || !POSITIONS.has(position)) throw new DeckError(`assets[${index}] has invalid fit or position.`);
  return {
    id: string(value.id, `assets[${index}].id`, 40),
    file,
    alt: string(value.alt, `assets[${index}].alt`, 500),
    fit,
    position,
    mediaType,
    sha256,
    originalName: string(value.originalName, `assets[${index}].originalName`, 255)
  };
}

function normalizeCaption(raw) {
  const value = object(raw, "caption");
  allowed(value, new Set(["body", "hashtags"]), "caption");
  if (!Array.isArray(value.hashtags) || value.hashtags.length > 30) {
    throw new DeckError("caption.hashtags must be an array with at most 30 items.");
  }
  return {
    body: string(value.body, "caption.body", 2200),
    hashtags: value.hashtags.map((tag, index) => string(tag, `caption.hashtags[${index}]`, 50))
  };
}

function countText(value, key = "") {
  if (typeof value === "string") return key === "path" ? 0 : [...value].length;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countText(item, key), 0);
  if (isPlainObject(value)) return Object.entries(value).reduce((sum, [childKey, child]) => sum + countText(child, childKey), 0);
  return 0;
}

function normalizeDeck(raw, assetMode) {
  const value = object(raw, "deck");
  allowed(value, new Set(["version", "template", "meta", "slides", "assets", "caption"]), "deck");
  if (value.version !== 1) throw new DeckError("deck.version must be 1.");
  const template = Object.hasOwn(value, "template") ? value.template : undefined;
  if (Object.hasOwn(value, "template") && template !== "editorial-blue") {
    throw new DeckError("deck.template must be editorial-blue when provided.");
  }
  if (!Array.isArray(value.slides) || value.slides.length < 5 || value.slides.length > 10) {
    throw new DeckError("deck.slides must contain 5 to 10 slides.");
  }
  if (!Array.isArray(value.assets) || value.assets.length > 4) {
    throw new DeckError("deck.assets must contain at most 4 assets.");
  }

  const slides = value.slides.map((slide, index) => normalizeSlide(slide, index, template));
  if (slides[0].layout !== "cover") throw new DeckError("The first slide must use the cover layout.");
  if (slides.at(-1).layout !== "close") throw new DeckError("The last slide must use the close layout.");
  if (new Set(slides.slice(1, -1).map((slide) => slide.layout)).size < 2) {
    throw new DeckError("The deck must use at least 2 distinct middle layouts.");
  }

  const assets = value.assets.map(assetMode === "canonical" ? normalizeCanonicalAsset : normalizeCandidateAsset);
  const ids = new Set();
  for (const asset of assets) {
    if (ids.has(asset.id)) throw new DeckError(`Duplicate asset id: ${asset.id}.`);
    ids.add(asset.id);
  }
  for (const slide of slides) {
    if (slide.layout === "cover" && template !== "editorial-blue" && slide.assetId !== undefined) throw new DeckError("The cover layout cannot use an asset.");
    if (slide.assetId && !ids.has(slide.assetId)) throw new DeckError(`Slide ${slide.id} references missing asset: ${slide.assetId}.`);
  }

  const deck = {
    version: 1,
    ...(template === "editorial-blue" ? { template } : {}),
    meta: normalizeMeta(value.meta),
    slides,
    assets,
    caption: normalizeCaption(value.caption)
  };
  if (countText(deck) > 12000) throw new DeckError("All user-authored text must total at most 12000 characters.");
  return deck;
}

export function validateCandidateDeck(raw) {
  return normalizeDeck(raw, "candidate");
}

export function validateCanonicalDeck(raw) {
  return normalizeDeck(raw, "canonical");
}

function targetExtension(mediaType) {
  if (mediaType === "image/png") return ".png";
  if (mediaType === "image/webp") return ".webp";
  return ".jpg";
}

export async function resolveCandidateDeck(raw) {
  const candidate = validateCandidateDeck(raw);
  const resolvedAssets = await Promise.all(candidate.assets.map(readAsset));
  const canonicalAssets = resolvedAssets.map((asset) => ({
    id: asset.id,
    file: path.posix.join("assets", `${asset.sha256.slice(0, 16)}${targetExtension(asset.mediaType)}`),
    alt: asset.alt,
    fit: asset.fit,
    position: asset.position,
    mediaType: asset.mediaType,
    sha256: asset.sha256,
    originalName: asset.originalName
  }));
  const canonicalDeck = validateCanonicalDeck({ ...candidate, assets: canonicalAssets });
  return { canonicalDeck, resolvedAssets };
}

export const deckLimits = Object.freeze({ slidesMin: 5, slidesMax: 10, assetsMax: 4, totalText: 12000 });
