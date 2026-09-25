import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readJsonFile, readSource } from '../scripts/lib/source.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'explain-source-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

function rejectsCode(action, code) {
  assert.throws(action, (error) => error?.code === code);
}

test('readSource returns unchanged UTF-8 text and its real SHA-256', async (t) => {
  const dir = await fixture(t);
  const file = path.join(dir, 'lesson.md');
  const text = '# 안녕하세요\r\n\r\n내 파일입니다. 🌱\n';
  await writeFile(file, text, 'utf8');

  assert.deepEqual(await readSource(file), {
    name: 'lesson.md',
    kind: 'md',
    sha256: createHash('sha256').update(Buffer.from(text)).digest('hex'),
    text,
    byteLength: Buffer.byteLength(text),
    lineCount: 4,
  });
});

test('readSource accepts exactly the three supported lowercase extensions', async (t) => {
  const dir = await fixture(t);
  for (const [name, kind] of [['a.md', 'md'], ['a.html', 'html'], ['a.json', 'json']]) {
    const file = path.join(dir, name);
    await writeFile(file, '{}');
    assert.equal((await readSource(file)).kind, kind);
  }
  const unsupported = path.join(dir, 'a.txt');
  const uppercase = path.join(dir, 'a.HTML');
  await writeFile(unsupported, 'text');
  await writeFile(uppercase, 'text');
  rejectsCode(() => readSource(unsupported), 'ERR_SOURCE_EXTENSION');
  rejectsCode(() => readSource(uppercase), 'ERR_SOURCE_EXTENSION');
});

test('readSource rejects missing paths, directories, and final-component symlinks', async (t) => {
  const dir = await fixture(t);
  const target = path.join(dir, 'target.md');
  const link = path.join(dir, 'link.md');
  await writeFile(target, '# target');
  await symlink(target, link);

  rejectsCode(() => readSource(path.join(dir, 'missing.md')), 'ERR_SOURCE_NOT_FOUND');
  rejectsCode(() => readSource(dir), 'ERR_SOURCE_NOT_FILE');
  rejectsCode(() => readSource(link), 'ERR_SOURCE_SYMLINK');
});

test('readSource rejects NUL bytes, invalid UTF-8, and files over 131072 bytes', async (t) => {
  const dir = await fixture(t);
  const nul = path.join(dir, 'nul.md');
  const invalid = path.join(dir, 'invalid.html');
  const large = path.join(dir, 'large.json');
  await writeFile(nul, Buffer.from([0x61, 0, 0x62]));
  await writeFile(invalid, Buffer.from([0xc3, 0x28]));
  await writeFile(large, Buffer.alloc(131073, 0x20));

  rejectsCode(() => readSource(nul), 'ERR_SOURCE_BINARY');
  rejectsCode(() => readSource(invalid), 'ERR_SOURCE_UTF8');
  rejectsCode(() => readSource(large), 'ERR_SOURCE_TOO_LARGE');
});

test('readSource permits a file exactly at the byte limit', async (t) => {
  const dir = await fixture(t);
  const file = path.join(dir, 'limit.md');
  await writeFile(file, Buffer.alloc(131072, 0x61));
  assert.equal((await readSource(file)).byteLength, 131072);
});

test('readSource preserves a UTF-8 BOM as source text', async (t) => {
  const dir = await fixture(t);
  const file = path.join(dir, 'bom.md');
  await writeFile(file, Buffer.from([0xef, 0xbb, 0xbf, 0x23, 0x20, 0x78]));
  assert.equal(readSource(file).text, '\uFEFF# x');
});

test('readJsonFile uses the same safe reader and parses JSON without merging', async (t) => {
  const dir = await fixture(t);
  const file = path.join(dir, 'lesson.json');
  await writeFile(file, '{"safe":true,"__proto__":{"polluted":true}}');
  const value = await readJsonFile(file);
  assert.equal(value.safe, true);
  assert.equal(Object.hasOwn(value, '__proto__'), true);
  assert.equal({}.polluted, undefined);

  const bad = path.join(dir, 'bad.json');
  await writeFile(bad, '{ nope');
  rejectsCode(() => readJsonFile(bad), 'ERR_JSON_PARSE');
});

test('readJsonFile rejects invalid inputs, symlinks, invalid UTF-8, and oversized files', async (t) => {
  const dir = await fixture(t);
  const target = path.join(dir, 'target.json');
  const link = path.join(dir, 'link.json');
  await writeFile(target, '{}');
  await symlink(target, link);
  rejectsCode(() => readJsonFile(link), 'ERR_JSON_SYMLINK');

  const invalid = path.join(dir, 'invalid.json');
  await writeFile(invalid, Buffer.from([0xff]));
  rejectsCode(() => readJsonFile(invalid), 'ERR_JSON_UTF8');

  const large = path.join(dir, 'large.json');
  await writeFile(large, Buffer.alloc(131073, 0x20));
  rejectsCode(() => readJsonFile(large), 'ERR_JSON_TOO_LARGE');
  rejectsCode(() => readJsonFile(42), 'ERR_JSON_PATH');
});
