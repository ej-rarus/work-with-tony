import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderLesson } from '../scripts/lib/render.mjs';

const attack = '</script><img src=x onerror=alert(1)>';
const fixture = (kind = 'html') => ({
  version: 1, title: `제목 ${attack}`, summary: '내 파일의 일부를 읽고 연습합니다.',
  source: { name: `실습-${attack}.${kind}`, kind, sha256: 'a'.repeat(64) },
  sections: [{ title: '제목 구간', quote: attack, explanation: '문자 그대로 읽습니다.', start: 0, end: attack.length, lineStart: 1, lineEnd: 1 }],
  practice: { kind, task: '아래 입력을 바꿔 보세요.', hint: '원본은 바뀌지 않습니다.', initial:
    kind === 'html' ? { heading: attack, paragraph: '본문', buttonText: '배우기', buttonColor: '#2457E6' } :
    kind === 'md' ? { heading: '제목', paragraph: attack, items: ['하나'], linkText: '참고', linkUrl: 'javascript:alert(1)' } :
    { json: JSON.stringify({ title: attack }) }
  }
});

test('untrusted closing-script text roundtrips only as JSON data, never executable markup', () => {
  const html = renderLesson(fixture());
  assert.equal(typeof html, 'string');
  assert.ok(!html.includes(attack));
  assert.ok(!/<img\b/i.test(html));
  const data = html.match(/<script id="lesson-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(data, 'lesson data must have a non-executable JSON block');
  assert.deepEqual(JSON.parse(data[1]), fixture());
  assert.ok(!data[1].includes('<'));
  assert.match(html, /&lt;\/script&gt;&lt;img/);
});

test('CSP hashes authorize the exact bundled code and style while blocking external resources', () => {
  const html = renderLesson(fixture());
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of ["default-src 'none'", "connect-src 'none'", "img-src 'none'", "frame-src 'none'", "form-action 'none'", "object-src 'none'", "base-uri 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.ok(!csp.includes('unsafe-inline'));
  assert.ok(!csp.includes('unsafe-eval'));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(script?.length > 0);
  assert.ok(style?.length > 0);
  for (const text of [script, style]) {
    const hash = createHash('sha256').update(text).digest('base64');
    assert.ok(csp.includes(`'sha256-${hash}'`));
  }
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<style>'));
  assert.ok(!/<(?:script|link|iframe|img)\b[^>]*(?:src|href)=/i.test(html));
});

for (const kind of ['html', 'md', 'json']) {
  test(`${kind} data preserves literal inputs and the canonical source identity`, () => {
    const input = fixture(kind);
    const html = renderLesson(input);
    const data = JSON.parse(html.match(/<script id="lesson-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(data, input);
    assert.match(html, /lang="ko"/);
    assert.match(html, /name="viewport"/);
    assert.match(html, /<noscript>/);
  });
}

test('browser and build agree on 19/20/21 container levels, including scalar and empty leaves', {
  skip: !process.env.EXPLAIN_TEST_PLAYWRIGHT || !process.env.EXPLAIN_TEST_CHROMIUM,
  timeout: 60000,
}, async () => {
  const imported = await import(pathToFileURL(process.env.EXPLAIN_TEST_PLAYWRIGHT).href);
  const { chromium } = imported.default || imported;
  const { buildLesson } = await import('../scripts/explain.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'explain-depth-regression-'));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.EXPLAIN_TEST_CHROMIUM });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let lastValidPage;
    for (const depth of [19, 20, 21]) {
      for (const [leafName, leaf, leafDepth] of [['scalar', '0', 0], ['empty-array', '[]', 1], ['empty-object', '{}', 1]]) {
        const wrappers = depth - leafDepth;
        const json = '['.repeat(wrappers) + leaf + ']'.repeat(wrappers);
        const name = `${depth}-${leafName}`;
        const file = join(directory, `${name}.json`);
        const lesson = join(directory, `${name}.lesson.json`);
        const out = join(directory, `${name}-out`);
        await writeFile(file, json);
        await writeFile(lesson, JSON.stringify({
          version: 1, sourceHash: createHash('sha256').update(json).digest('hex'), title: '깊이 경계 검증', summary: '배열과 객체만 깊이로 셉니다.',
          sections: [{ title: '원문', quote: json, explanation: '컨테이너 깊이 경계값입니다.' }],
          practice: { kind: 'json', task: '값을 비교합니다.', hint: '20단계까지 허용합니다.', initial: { json } },
        }));
        if (depth <= 20) {
          await buildLesson({ file, lesson, out });
          lastValidPage = pathToFileURL(join(out, 'index.html')).href;
          await page.goto(lastValidPage);
          assert.equal(await page.locator('#input-error').isVisible(), false, `${name}: accepted build must be accepted by initial UI`);
          assert.equal(await page.locator('#after-state').textContent(), '처음과 같음', name);
          assert.equal(await page.locator('#before-code').textContent(), await page.locator('#after-code').textContent(), name);
          await page.locator('#json').fill('0');
          await page.locator('#json').fill(json);
          assert.equal(await page.locator('#input-error').isVisible(), false, `${name}: edited input accepted`);
        } else {
          assert.throws(() => buildLesson({ file, lesson, out }), { code: 'ERR_LESSON_JSON_DEPTH' });
          await page.goto(lastValidPage);
          await page.locator('#json').fill(json);
          assert.equal(await page.locator('#input-error').isVisible(), true, `${name}: edited input rejected`);
          assert.equal(await page.locator('#json').getAttribute('aria-invalid'), 'true', name);
        }
      }
    }
    await page.goto(lastValidPage);
    for (const overflow of ['1e400', '-1e400', '{"number":1e400}', '[{"number":-1e400}]']) {
      await page.locator('#json').fill(overflow);
      assert.equal(await page.locator('#input-error').isVisible(), true, `${overflow}: reject nonfinite numbers`);
      assert.equal(await page.locator('#json').getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#after-code').textContent(), overflow, 'preserve invalid input, not null');
      assert.equal(await page.locator('#after-preview .json-tree').count(), 0, 'do not show a valid result');
      await page.locator('#json').fill('{"number":1.7976931348623157e308}');
      assert.equal(await page.locator('#input-error').isVisible(), false, 'recover at a finite numeric boundary');
      assert.equal(await page.locator('#json').getAttribute('aria-invalid'), 'false');
      assert.ok((await page.locator('#after-code').textContent()).includes('1.7976931348623157e+308'));
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
