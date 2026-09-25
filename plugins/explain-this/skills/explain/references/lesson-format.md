# Lesson candidate format

Read this reference only when the user has asked to create an exercise or offline lesson.

Create one plain JSON object with exactly this top-level shape:

```json
{
  "version": 1,
  "sourceHash": "sha256 of the inspected source",
  "title": "내 파일의 제목 이해하기",
  "summary": "이 파일에서 무엇을 배울지 설명합니다.",
  "sections": [
    {
      "title": "제목",
      "quote": "exact source substring",
      "explanation": "이 구간의 의미",
      "occurrence": 1
    }
  ],
  "practice": {
    "kind": "html",
    "task": "제목과 버튼 색상을 바꿔보세요.",
    "hint": "아래 입력을 바꾸면 수정 후 화면만 달라집니다.",
    "initial": {
      "heading": "일 잘하는 토니",
      "paragraph": "내 파일로 배우는 IT",
      "buttonText": "배우기",
      "buttonColor": "#2457E6"
    }
  }
}
```

`sourceHash` must be the SHA-256 returned by the current successful inspection. Every `quote` must be a nonempty exact substring of the source text. `occurrence` is optional and one-based, but required when the quote occurs more than once. Do not calculate `start`, `end`, `lineStart`, or `lineEnd`; the builder derives them using UTF-16 offsets and one-based line numbers.

Use 1–12 sections. Each quote is at most 4,000 characters and all quotes together at most 20,000. Limits for other strings are: title 160, summary 2,000, section title 160, explanation 3,000, and practice task/hint 600 characters each. Practice text fields are at most 2,000 characters.

The practice `kind` must equal the inspected source kind and determines `initial`:

- `html`: `{"heading":"...","paragraph":"...","buttonText":"...","buttonColor":"#RRGGBB"}`. The color must be exactly six hexadecimal digits.
- `md`: `{"heading":"...","paragraph":"...","items":["..."],"linkText":"...","linkUrl":"..."}`. Use at most 20 item strings. The UI edits each item in its own text field, with an add-item button and individual delete buttons. A newline stays within that item; do not tell the learner that Enter creates a new list item. The link is displayed as text and is never fetched or navigated.
- `json`: `{"json":"valid JSON text"}`. The JSON text is at most 16,000 characters with maximum container nesting 20 (arrays and objects; primitive leaves do not add a level) and maximum node count 1,000. Numbers must parse to finite JavaScript numbers; overflow such as `1e400` is rejected. Ordinary numbers use JavaScript numeric precision, so do not use this exercise for exact large-integer or decimal arithmetic. It is parsed and stringified only, never evaluated or merged.

The practice is a small reconstructed learning example. It should illustrate concepts from the source without claiming to reproduce the original file, layout, or behavior. Unknown candidate fields are not retained in canonical output.

Write the task and hint for these actual controls: HTML has separate title, paragraph, button-text and hex-color fields; Markdown has separate title, paragraph, item, link-label and inert URL fields; JSON has one JSON-text editor. Each mode offers reset and live before/after comparison. Do not invent unsupported controls or keyboard behavior.
