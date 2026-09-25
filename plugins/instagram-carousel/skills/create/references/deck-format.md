# Deck format

The candidate is one plain JSON object. Preserve newlines in text. Do not put HTML, CSS, URLs, or executable code in layout fields.

```json
{
  "version": 1,
  "template": "editorial-blue",
  "meta": {
    "brand": "일 잘하는 토니",
    "handle": "@work.with.tony",
    "series": "IT 기초",
    "issue": "001",
    "title": "MD 파일, 왜 자꾸 보일까?"
  },
  "slides": [],
  "assets": [],
  "caption": { "body": "본문", "hashtags": ["PM"] }
}
```

`template` is optional. Its only supported explicit value is `"editorial-blue"`, which selects the photo-led blue/ivory HTML design. Omit the field to preserve legacy Tony Digital Field Notes behavior; do not pass `null`, an empty string, or a guessed legacy name. The skeleton above needs 5–10 actual slides before validation.

## Slides

Every slide requires `id`, `layout`, `title`, and `altText`. IDs are sequential two-digit strings from `01`. Use 5–10 slides. First is `cover`, last is `close`, and the middle includes at least two distinct layout names.

- `cover`: optional `body`; optional `assetId` only when root `template` is `"editorial-blue"`. A legacy cover cannot use an asset.
- `scene`: optional `body`, `note`, `assetId`.
- `compare`: required `before`, `after`; optional `body`.
- `checklist`: required `items` array with 2–6 strings; optional `body`.
- `prompt`: required `prompt`; optional `body`.
- `statement`: optional `body`, `note`.
- `close`: optional `body`, `next`, `assetId`.

## Assets

Candidate assets use:

```json
{
  "id": "cover-photo",
  "path": "/absolute/path/to/md-paper-editorial.png",
  "alt": "파란 배경 위에서 종이를 들추면 Markdown 원문이 드러나는 사진",
  "fit": "cover",
  "position": "center"
}
```

`fit` is `cover` or `contain`. `position` is `center`, `top`, `bottom`, `left`, or `right`. Paths must point to regular PNG, JPEG, or WebP files whose extension matches the file signature. The maximum is four assets and 15 MiB each. `scene` and `close` may reference an asset by id; `cover` may do so only for `editorial-blue`. Every referenced id must exist in `assets`.

Prefer absolute candidate asset paths. Relative candidate paths resolve from the CLI working directory, not the candidate JSON's directory. Run the bundled `examples/editorial-blue.deck.json` from the plugin root so its `examples/assets/md-paper-editorial.png` path resolves.

A built project's canonical `deck.json` replaces `path` with its copied relative `file`, hash, media type, and original name. Canonical `file` values resolve from that `deck.json`'s directory: `/absolute/project-01/deck.json` with `file: "assets/0123456789abcdef.png"` uses `/absolute/project-01/assets/0123456789abcdef.png`. That canonical JSON is a supported input to `build`: edit its content, keep the copied assets in place, and rebuild into a new directory. Do not convert it by guessing hashes or modifying copied files.

To replace a photograph, create a candidate JSON using path-form assets throughout: each asset contains only `id`, `path`, `alt`, `fit`, and `position`. Point the changed asset at the new local image and retained assets at their existing absolute local paths, then rebuild. Do not mix canonical `file`/hash entries with candidate `path` entries or overwrite trusted copied images.

The main title, body, metadata, and footer/page labels render as HTML text. Wording photographed on a physical object remains part of the image. A new content topic may therefore require a new image as well as new JSON text.

## Limits

- `title` 50 characters; `body` 240; `note` 120; `before` and `after` 180 each.
- Checklist item 100; prompt 800; `next` 80; alt text 500.
- Caption body 2,200; hashtag 50; no more than 30 hashtags.
- All user-authored text together: 12,000 characters.

Unknown fields are rejected. Keep uncertain facts out of the deck or write `확인 필요` as visible prose.
