import assert from "node:assert/strict";
import test from "node:test";

import { DeckError, validateCandidateDeck, validateCanonicalDeck } from "../scripts/lib/deck.mjs";

function validDeck() {
  return {
    version: 1,
    meta: {
      brand: "일 잘하는 토니",
      handle: "@work.with.tony",
      series: "IT 기초",
      issue: "001",
      title: "MD 파일, 대체 뭘까?"
    },
    slides: [
      { id: "01", layout: "cover", title: "MD 파일, 대체 뭘까?", body: "메모처럼 쓰고 문서처럼 읽는 파일", altText: "MD 파일의 뜻을 묻는 표지" },
      { id: "02", layout: "scene", title: "확장자부터 보면", body: "파일 이름 끝의 .md가 힌트입니다.", note: "md는 Markdown의 줄임말", altText: "파일 확장자 md를 설명하는 장면" },
      { id: "03", layout: "compare", title: "기호가 서식이 됩니다", before: "# 제목", after: "제목", altText: "마크다운 원문과 표시 결과 비교" },
      { id: "04", layout: "checklist", title: "PM에게 쓸모 있는 순간", items: ["회의 메모", "요구사항 초안"], altText: "마크다운 활용처 두 가지" },
      { id: "05", layout: "close", title: "다음 파일을 열어보세요", body: "README.md부터 시작하면 됩니다.", next: "다음 편: HTML", altText: "README 파일을 열어보라는 마무리" }
    ],
    assets: [],
    caption: {
      body: "개발자가 보내준 .md 파일, 이제 겁먹지 마세요.",
      hashtags: ["PM", "마크다운"]
    }
  };
}

test("validateCandidateDeck returns a canonical five-slide deck", () => {
  const deck = validateCandidateDeck(validDeck());
  assert.equal(deck.version, 1);
  assert.equal(deck.slides.length, 5);
  assert.deepEqual(deck.slides.map((slide) => slide.id), ["01", "02", "03", "04", "05"]);
  assert.equal(deck.slides[2].before, "# 제목");
  assert.deepEqual(deck.assets, []);
});

test("slide order, endpoints, and middle-layout variety are enforced", () => {
  const wrongOrder = validDeck();
  wrongOrder.slides[1].id = "07";
  assert.throws(() => validateCandidateDeck(wrongOrder), DeckError);

  const wrongEndpoints = validDeck();
  wrongEndpoints.slides[0].layout = "statement";
  assert.throws(() => validateCandidateDeck(wrongEndpoints), /first slide.*cover/i);

  const repeated = validDeck();
  repeated.slides.splice(1, 3,
    { id: "02", layout: "statement", title: "둘", altText: "둘" },
    { id: "03", layout: "statement", title: "셋", altText: "셋" },
    { id: "04", layout: "statement", title: "넷", altText: "넷" }
  );
  assert.throws(() => validateCandidateDeck(repeated), /distinct middle layouts/i);
});

test("layout-specific fields and documented text limits are enforced", () => {
  const missing = validDeck();
  delete missing.slides[2].after;
  assert.throws(() => validateCandidateDeck(missing), /after/);

  const longTitle = validDeck();
  longTitle.slides[1].title = "가".repeat(51);
  assert.throws(() => validateCandidateDeck(longTitle), /title.*50/i);

  const tooManyItems = validDeck();
  tooManyItems.slides[3].items = Array.from({ length: 7 }, (_, index) => `항목 ${index}`);
  assert.throws(() => validateCandidateDeck(tooManyItems), /items.*2.*6/i);
});

test("assets are optional, bounded, and cannot appear on a cover", () => {
  const coverAsset = validDeck();
  coverAsset.assets = [{ id: "photo", path: "/tmp/photo.png", alt: "예시" }];
  coverAsset.slides[0].assetId = "photo";
  assert.throws(() => validateCandidateDeck(coverAsset), /cover.*asset/i);

  const tooMany = validDeck();
  tooMany.assets = Array.from({ length: 5 }, (_, index) => ({ id: `a${index}`, path: `/tmp/${index}.png`, alt: `이미지 ${index}` }));
  assert.throws(() => validateCandidateDeck(tooMany), /at most 4 assets/i);
});

test("all user-authored text is capped at 12000 characters", () => {
  const deck = validDeck();
  deck.slides = [
    { id: "01", layout: "cover", title: "표지", body: "가".repeat(240), altText: "가".repeat(500) },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: String(index + 2).padStart(2, "0"),
      layout: "prompt",
      title: `프롬프트 ${index + 1}`,
      body: "가".repeat(240),
      prompt: "나".repeat(800),
      altText: "다".repeat(500)
    })),
    { id: "09", layout: "statement", title: "정리", body: "가".repeat(240), note: "나".repeat(120), altText: "다".repeat(500) },
    { id: "10", layout: "close", title: "마무리", body: "가".repeat(240), next: "나".repeat(80), altText: "다".repeat(500) }
  ];
  deck.caption.body = "라".repeat(2200);
  deck.caption.hashtags = Array.from({ length: 30 }, () => "마".repeat(50));
  assert.throws(() => validateCandidateDeck(deck), /12000/);
});

test("canonical validation refuses source paths and unknown fields", () => {
  const candidate = validDeck();
  const canonical = validateCandidateDeck(candidate, { resolveAssets: false });
  assert.deepEqual(validateCanonicalDeck(canonical), canonical);

  const leaked = structuredClone(canonical);
  leaked.assets.push({ id: "x", path: "/private/source.png", alt: "x" });
  assert.throws(() => validateCanonicalDeck(leaked), /path/);

  const unknown = structuredClone(canonical);
  unknown.slides[1].html = "<script>alert(1)</script>";
  assert.throws(() => validateCanonicalDeck(unknown), /unknown field/i);
});
