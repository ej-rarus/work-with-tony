import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync, lstatSync, symlinkSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const plugin = fileURLToPath(new URL('../', import.meta.url));
const cli = join(plugin, 'scripts/explain.mjs');
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'explain-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const text = '<h1>일 잘하는 토니</h1>\n<p>내 파일로 배우는 IT</p>\n';
  const file = join(dir, 'source.html');
  const lesson = join(dir, 'lesson-input.json');
  const candidate = {
    version: 1, sourceHash: createHash('sha256').update(text).digest('hex'), title: '제목을 바꾸면?', summary: 'h1은 제목의 구조를 나타냅니다.',
    sections: [{ title: '첫 번째 제목', quote: '<h1>일 잘하는 토니</h1>', explanation: 'h1 태그 안의 글자가 제목입니다.' }],
    practice: { kind: 'html', task: '제목을 바꿔보세요.', hint: '원본은 변하지 않아요.', initial: { heading: '일 잘하는 토니', paragraph: '내 파일로 배우는 IT', buttonText: '시작', buttonColor: '#2457E6' } },
  };
  writeFileSync(file, text);
  writeFileSync(lesson, JSON.stringify(candidate));
  return { dir, file, lesson, candidate, text, out: join(dir, 'practice') };
}
function run(args, entry = cli) {
  const result = spawnSync(process.execPath, [entry, ...args, '--json'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  let report;
  try { report = JSON.parse(result.stdout); } catch { report = { parseFailure: result.stderr || result.stdout || 'CLI returned no JSON output.' }; }
  assert.equal(report.parseFailure, undefined, report.parseFailure);
  return { code: result.status, report };
}
const buildArgs = f => ['build', '--file', f.file, '--lesson', f.lesson, '--out', f.out];

test('inspect returns selected file data without writing anything', t => {
  const f = fixture(t);
  const before = readdirSync(f.dir);
  const result = run(['inspect', '--file', f.file]);
  assert.equal(result.code, 0, JSON.stringify(result.report));
  assert.equal(result.report.source.text, f.text);
  assert.equal(result.report.source.kind, 'html');
  assert.equal(result.report.source.sha256, f.candidate.sourceHash);
  assert.deepEqual(readdirSync(f.dir), before);
});

test('build creates a self-contained lesson and preserves the source', t => {
  const f = fixture(t);
  const result = run(buildArgs(f));
  assert.equal(result.code, 0, JSON.stringify(result.report));
  assert.equal(result.report.originalPreserved, true);
  assert.deepEqual(readdirSync(f.out).sort(), ['index.html', 'lesson.json']);
  const data = JSON.parse(readFileSync(join(f.out, 'lesson.json'), 'utf8'));
  assert.equal(data.sections[0].lineStart, 1);
  assert.equal(data.source.sha256, f.candidate.sourceHash);
  assert.equal(readFileSync(f.file, 'utf8'), f.text);
  if (process.platform !== 'win32') {
    assert.equal(lstatSync(f.out).mode & 0o777, 0o700);
    assert.equal(lstatSync(join(f.out, 'index.html')).mode & 0o777, 0o600);
  }
  assert.ok(readFileSync(join(f.out, 'index.html'), 'utf8').includes('Content-Security-Policy'));
});

test('an existing output directory and its files are not overwritten', t => {
  const f = fixture(t);
  mkdirSync(f.out);
  writeFileSync(join(f.out, 'index.html'), 'user work');
  const result = run(buildArgs(f));
  assert.equal(result.code, 1);
  assert.equal(readFileSync(join(f.out, 'index.html'), 'utf8'), 'user work');
  assert.deepEqual(readdirSync(f.out), ['index.html']);
});

test('an output symlink is refused without touching its target', t => {
  const f = fixture(t);
  const outside = join(f.dir, 'other'); mkdirSync(outside);
  symlinkSync(outside, f.out, 'dir');
  assert.equal(run(buildArgs(f)).code, 1);
  assert.deepEqual(readdirSync(outside), []);
});

test('a stale lesson hash fails before creating any output', t => {
  const f = fixture(t);
  writeFileSync(f.file, `${f.text}<p>changed</p>`);
  const result = run(buildArgs(f));
  assert.equal(result.code, 1);
  assert.equal(readdirSync(f.dir).includes('practice'), false);
});

test('an invented source quote is rejected before writing', t => {
  const f = fixture(t);
  f.candidate.sections[0].quote = '<h1>not in file</h1>';
  writeFileSync(f.lesson, JSON.stringify(f.candidate));
  assert.equal(run(buildArgs(f)).code, 1);
  assert.equal(readdirSync(f.dir).includes('practice'), false);
});

test('unsupported source files produce an input failure', t => {
  const f = fixture(t); const file = join(f.dir, 'secret.env');
  writeFileSync(file, 'not a lesson');
  assert.equal(run(['inspect', '--file', file]).code, 1);
});

test('usage errors reject missing, duplicate, or operation-inappropriate options', t => {
  const f = fixture(t);
  for (const args of [
    ['unknown'], ['inspect'], ['build', '--file', f.file],
    ['inspect', '--file', f.file, '--file', f.file],
    ['inspect', '--file', f.file, '--out', f.out],
    ['inspect', '--file', f.file, '--overwrite'],
  ]) assert.equal(run(args).code, 2, args.join(' '));
});

test('output with a missing parent fails without creating extra directories', t => {
  const f = fixture(t); f.out = join(f.dir, 'missing', 'practice');
  assert.equal(run(buildArgs(f)).code, 1);
  assert.equal(readdirSync(f.dir).includes('missing'), false);
});

test('output cannot be placed inside the installed plugin tree', t => {
  const f = fixture(t); f.out = resolve(plugin, `rejected-output-${process.pid}`);
  assert.equal(run(buildArgs(f)).code, 1);
  assert.equal(readdirSync(plugin).includes(`rejected-output-${process.pid}`), false);
});

test('plugin works from a copied installation without repository-relative imports', t => {
  const f = fixture(t); const copied = join(f.dir, 'installed-plugin');
  cpSync(plugin, copied, { recursive: true });
  const result = run(buildArgs(f), join(copied, 'scripts/explain.mjs'));
  assert.equal(result.code, 0, JSON.stringify(result.report));
  assert.equal(readFileSync(f.file, 'utf8'), f.text);
});
