import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const css = readFileSync(new URL('../../assets/lesson.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../../assets/lesson.js', import.meta.url), 'utf8');
const hash = value => `'sha256-${createHash('sha256').update(value).digest('base64')}'`;
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** Render only validated canonical lesson data. Original file content is never executed. */
export function renderLesson(canonicalLesson) {
  const data = JSON.stringify(canonicalLesson).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  const policy = [
    "default-src 'none'", `script-src ${hash(js)}`, `style-src ${hash(css)}`,
    "script-src-attr 'none'", "style-src-attr 'none'", "connect-src 'none'",
    "img-src 'none'", "font-src 'none'", "media-src 'none'", "frame-src 'none'",
    "worker-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"
  ].join('; ');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(canonicalLesson.title)} · Explain This</title>
<style>${css}</style>
</head>
<body>
<a class="skip-link" href="#exercise">연습으로 바로 가기</a>
<div class="notebook">
  <header class="masthead"><span class="brand">Explain This</span><span class="offline-note">내 파일로 배우는 작업 노트</span></header>
  <main>
    <header class="lesson-header">
      <p id="source-file" class="source-file"></p>
      <h1 id="lesson-title"></h1>
      <p id="lesson-summary" class="lesson-summary"></p>
      <p class="safety-note">원본 파일은 바뀌지 않습니다. 입력한 내용은 이 화면에서만 사용되며, 새로고침하면 초기화됩니다.</p>
    </header>
    <section class="reading" aria-labelledby="reading-title">
      <div class="section-heading"><h2 id="reading-title">파일의 이 부분부터 이해해요</h2><span id="source-kind" class="format-label"></span></div>
      <p class="section-description">원문에서 가져온 구간과, 그 구간을 풀어 쓴 설명입니다.</p>
      <div id="source-sections"></div>
    </section>
    <section id="exercise" class="exercise" aria-labelledby="exercise-title" tabindex="-1">
      <div class="section-heading"><h2 id="exercise-title">직접 바꾸며 익히기</h2><span class="practice-label">재구성한 학습 예제</span></div>
      <p class="example-boundary">아래 화면은 연습을 위해 따로 만든 예제입니다. 원본 파일을 그대로 렌더링한 화면이 아닙니다.</p>
      <h3 id="practice-task" class="practice-task"></h3>
      <p id="practice-hint" class="section-description"></p>
      <div class="editor-layout">
        <section class="editor" aria-labelledby="editor-title">
          <div class="editor-heading"><h3 id="editor-title">예제 수정</h3><button id="reset" class="reset-button" type="button">처음으로 되돌리기</button></div>
          <p class="editor-help">입력을 바꾸면 ‘수정 후’에 바로 반영됩니다.</p>
          <div id="editor-fields"></div>
          <p id="input-error" class="input-error" role="alert" hidden></p>
          <p id="edit-status" class="edit-status" role="status" aria-live="polite"></p>
        </section>
        <div class="comparison">
          <section class="comparison-pane before-pane" aria-labelledby="before-title">
            <div class="pane-heading"><h3 id="before-title">수정 전</h3><span>처음 상태</span></div>
            <div id="before-preview" class="preview"></div>
            <div class="code-heading"><h4>예제 코드</h4><span class="code-kind"></span></div>
            <pre class="generated-code" tabindex="0" aria-label="수정 전 예제 코드"><code id="before-code"></code></pre>
          </section>
          <section class="comparison-pane after-pane" aria-labelledby="after-title">
            <div class="pane-heading"><h3 id="after-title">수정 후</h3><span id="after-state">처음과 같음</span></div>
            <div id="after-preview" class="preview"></div>
            <div class="code-heading"><h4 id="after-code-label">예제 코드</h4><span class="code-kind"></span></div>
            <pre class="generated-code" tabindex="0" aria-label="수정 후 예제 코드"><code id="after-code"></code></pre>
          </section>
        </div>
      </div>
    </section>
  </main>
  <footer class="footer"><span>읽고, 조금 바꾸고, 차이를 확인하세요.</span><span>오프라인 학습 · 원본 유지</span></footer>
</div>
<noscript>학습 화면을 사용하려면 브라우저의 JavaScript를 켜 주세요. 원본 파일에는 영향을 주지 않습니다.</noscript>
<script id="lesson-data" type="application/json">${data}</script>
<script>${js}</script>
</body>
</html>`;
}
