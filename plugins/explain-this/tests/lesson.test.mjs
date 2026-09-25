import assert from 'node:assert/strict';
import test from 'node:test';

import { validateLesson } from '../scripts/lib/lesson.mjs';

const source = {
  name: 'guide.html',
  kind: 'html',
  sha256: 'a'.repeat(64),
  text: '<h1>제목</h1>\n<p>설명</p>\n<h1>제목</h1>',
  byteLength: 0,
  lineCount: 3,
};

function candidate(overrides = {}) {
  return {
    version: 1,
    sourceHash: source.sha256,
    title: '내 파일 이해하기',
    summary: '중요한 구조를 배웁니다.',
    sections: [{ title: '문단', quote: '<p>설명</p>', explanation: '설명 문단입니다.' }],
    practice: {
      kind: 'html',
      task: '내용을 바꿔보세요.',
      hint: '입력하면 수정 후 화면이 달라집니다.',
      initial: {
        heading: '제목',
        paragraph: '설명',
        buttonText: '배우기',
        buttonColor: '#2457E6',
      },
    },
    ...overrides,
  };
}

function rejectsCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

test('validateLesson returns only canonical fields and derives UTF-16 offsets and lines', () => {
  const input = candidate({ ignored: 'drop me' });
  input.sections[0].ignored = true;
  input.practice.ignored = true;
  input.practice.initial.ignored = true;

  assert.deepEqual(validateLesson(source, input), {
    version: 1,
    title: '내 파일 이해하기',
    summary: '중요한 구조를 배웁니다.',
    source: { name: 'guide.html', kind: 'html', sha256: source.sha256 },
    sections: [{
      title: '문단',
      quote: '<p>설명</p>',
      explanation: '설명 문단입니다.',
      start: 12,
      end: 21,
      lineStart: 2,
      lineEnd: 2,
    }],
    practice: {
      kind: 'html',
      task: '내용을 바꿔보세요.',
      hint: '입력하면 수정 후 화면이 달라집니다.',
      initial: {
        heading: '제목',
        paragraph: '설명',
        buttonText: '배우기',
        buttonColor: '#2457E6',
      },
    },
  });
});

test('hash must exactly match the inspected source', () => {
  rejectsCode(() => validateLesson(source, candidate({ sourceHash: 'b'.repeat(64) })), 'ERR_LESSON_SOURCE_HASH');
});

test('quotes must exist exactly and ambiguous quotes require a valid occurrence', () => {
  rejectsCode(() => validateLesson(source, candidate({
    sections: [{ title: 'x', quote: 'not present', explanation: 'x' }],
  })), 'ERR_LESSON_QUOTE_NOT_FOUND');
  rejectsCode(() => validateLesson(source, candidate({
    sections: [{ title: 'x', quote: '<h1>제목</h1>', explanation: 'x' }],
  })), 'ERR_LESSON_QUOTE_AMBIGUOUS');
  rejectsCode(() => validateLesson(source, candidate({
    sections: [{ title: 'x', quote: '<h1>제목</h1>', explanation: 'x', occurrence: 3 }],
  })), 'ERR_LESSON_OCCURRENCE');

  const section = validateLesson(source, candidate({
    sections: [{ title: 'x', quote: '<h1>제목</h1>', explanation: 'x', occurrence: 2 }],
  })).sections[0];
  assert.deepEqual({ start: section.start, end: section.end, lineStart: section.lineStart, lineEnd: section.lineEnd }, {
    start: 22,
    end: 33,
    lineStart: 3,
    lineEnd: 3,
  });
});

test('quote matching includes overlapping occurrences', () => {
  const overlapping = { ...source, text: 'aaa' };
  rejectsCode(() => validateLesson(overlapping, candidate({
    sections: [{ title: 'x', quote: 'aa', explanation: 'x' }],
  })), 'ERR_LESSON_QUOTE_AMBIGUOUS');
  assert.equal(validateLesson(overlapping, candidate({
    sections: [{ title: 'x', quote: 'aa', explanation: 'x', occurrence: 2 }],
  })).sections[0].start, 1);
});

test('derived positions are UTF-16 offsets and line ranges handle CRLF and CR', () => {
  const unicodeSource = { ...source, text: '🌱 first\r\nsecond\r🌙 end' };
  const section = validateLesson(unicodeSource, candidate({
    sections: [{ title: 'x', quote: 'second\r🌙', explanation: 'x' }],
  })).sections[0];
  assert.deepEqual({ start: section.start, end: section.end, lineStart: section.lineStart, lineEnd: section.lineEnd }, {
    start: 10,
    end: 19,
    lineStart: 2,
    lineEnd: 3,
  });
});

test('candidate and nested shapes must be plain JSON objects with required types', () => {
  for (const value of [null, [], 'lesson', new Date()]) {
    rejectsCode(() => validateLesson(source, value), 'ERR_LESSON_SHAPE');
  }
  rejectsCode(() => validateLesson(source, candidate({ version: '1' })), 'ERR_LESSON_VERSION');
  rejectsCode(() => validateLesson(source, candidate({ sections: {} })), 'ERR_LESSON_SECTIONS');
  rejectsCode(() => validateLesson(source, candidate({ practice: [] })), 'ERR_LESSON_PRACTICE');
  rejectsCode(() => validateLesson(source, candidate({ title: 7 })), 'ERR_LESSON_STRING');
});

test('section counts and all documented string limits are enforced', () => {
  rejectsCode(() => validateLesson(source, candidate({ sections: [] })), 'ERR_LESSON_SECTIONS');
  rejectsCode(() => validateLesson(source, candidate({ sections: Array.from({ length: 13 }, () => ({
    title: 'x', quote: '<p>설명</p>', explanation: 'x',
  })) })), 'ERR_LESSON_SECTIONS');
  rejectsCode(() => validateLesson(source, candidate({ title: 'x'.repeat(161) })), 'ERR_LESSON_STRING');
  rejectsCode(() => validateLesson(source, candidate({ summary: 'x'.repeat(2001) })), 'ERR_LESSON_STRING');
  rejectsCode(() => validateLesson(source, candidate({ sections: [{
    title: 'x'.repeat(161), quote: '<p>설명</p>', explanation: 'x',
  }] })), 'ERR_LESSON_STRING');
  rejectsCode(() => validateLesson({ ...source, text: 'x'.repeat(4001) }, candidate({ sections: [{
    title: 'x', quote: 'x'.repeat(4001), explanation: 'x', occurrence: 1,
  }] })), 'ERR_LESSON_QUOTE_LIMIT');
  rejectsCode(() => validateLesson(source, candidate({ sections: [{
    title: 'x', quote: '<p>설명</p>', explanation: 'x'.repeat(3001),
  }] })), 'ERR_LESSON_STRING');
  rejectsCode(() => validateLesson(source, candidate({ practice: {
    ...candidate().practice, task: 'x'.repeat(601),
  } })), 'ERR_LESSON_STRING');
});

test('all section quotes together are limited to 20000 characters', () => {
  const text = Array.from({ length: 6 }, (_, index) => `${index}:${'x'.repeat(3998)}`).join('\n');
  const sections = Array.from({ length: 6 }, (_, index) => ({
    title: String(index), quote: `${index}:${'x'.repeat(3998)}`, explanation: 'x', occurrence: 1,
  }));
  rejectsCode(() => validateLesson({ ...source, text }, candidate({ sections })), 'ERR_LESSON_QUOTE_LIMIT');
});

test('practice kind must match source and HTML colors must be exact six-digit hex', () => {
  rejectsCode(() => validateLesson(source, candidate({ practice: {
    ...candidate().practice, kind: 'md',
  } })), 'ERR_LESSON_PRACTICE_KIND');
  for (const color of ['red', '#fff', '#1234567', ' #2457E6', '#GG0000']) {
    rejectsCode(() => validateLesson(source, candidate({ practice: {
      ...candidate().practice,
      initial: { ...candidate().practice.initial, buttonColor: color },
    } })), 'ERR_LESSON_COLOR');
  }
  assert.equal(validateLesson(source, candidate({ practice: {
    ...candidate().practice,
    initial: { ...candidate().practice.initial, buttonColor: '#abcdef' },
  } })).practice.initial.buttonColor, '#abcdef');
});

test('Markdown practice has bounded text and at most 20 string items', () => {
  const mdSource = { ...source, name: 'guide.md', kind: 'md', text: 'quote' };
  const mdPractice = {
    kind: 'md', task: 'task', hint: 'hint',
    initial: { heading: 'h', paragraph: 'p', items: ['one'], linkText: 'link', linkUrl: 'https://example.invalid' },
  };
  assert.deepEqual(validateLesson(mdSource, candidate({
    sections: [{ title: 'x', quote: 'quote', explanation: 'x' }], practice: mdPractice,
  })).practice.initial.items, ['one']);
  rejectsCode(() => validateLesson(mdSource, candidate({
    sections: [{ title: 'x', quote: 'quote', explanation: 'x' }],
    practice: { ...mdPractice, initial: { ...mdPractice.initial, items: Array(21).fill('x') } },
  })), 'ERR_LESSON_ITEMS');
  rejectsCode(() => validateLesson(mdSource, candidate({
    sections: [{ title: 'x', quote: 'quote', explanation: 'x' }],
    practice: { ...mdPractice, initial: { ...mdPractice.initial, items: [3] } },
  })), 'ERR_LESSON_STRING');
  rejectsCode(() => validateLesson(mdSource, candidate({
    sections: [{ title: 'x', quote: 'quote', explanation: 'x' }],
    practice: { ...mdPractice, initial: { ...mdPractice.initial, heading: 'x'.repeat(2001) } },
  })), 'ERR_LESSON_STRING');
});

test('JSON practice requires valid bounded JSON text', () => {
  const jsonSource = { ...source, name: 'guide.json', kind: 'json', text: '{"quote":true}' };
  const make = (json) => candidate({
    sections: [{ title: 'x', quote: '"quote"', explanation: 'x' }],
    practice: { kind: 'json', task: 'task', hint: 'hint', initial: { json } },
  });
  assert.equal(validateLesson(jsonSource, make('{"ok":true}')).practice.initial.json, '{"ok":true}');
  rejectsCode(() => validateLesson(jsonSource, make('{ nope')), 'ERR_LESSON_JSON');
  rejectsCode(() => validateLesson(jsonSource, make(' '.repeat(16001))), 'ERR_LESSON_JSON_LIMIT');
});

test('JSON practice rejects numeric overflow at the root or nested', () => {
  const jsonSource = { ...source, name: 'guide.json', kind: 'json', text: '{"quote":true}' };
  const make = (json) => candidate({
    sections: [{ title: 'x', quote: '"quote"', explanation: 'x' }],
    practice: { kind: 'json', task: 'task', hint: 'hint', initial: { json } },
  });
  for (const json of ['1e400', '-1e400', '{"value":1e400}', '[0,-1e400]']) {
    rejectsCode(() => validateLesson(jsonSource, make(json)), 'ERR_LESSON_JSON_NUMBER');
  }
  for (const json of ['0', '-0', '1.25', '-3', '1e300', '{"values":[0,42.5,-7]}']) {
    assert.equal(validateLesson(jsonSource, make(json)).practice.initial.json, json);
  }
});

test('JSON practice limits nesting to 20 and parsed nodes to 1000', () => {
  const jsonSource = { ...source, name: 'guide.json', kind: 'json', text: '{"quote":true}' };
  const make = (json) => candidate({
    sections: [{ title: 'x', quote: '"quote"', explanation: 'x' }],
    practice: { kind: 'json', task: 'task', hint: 'hint', initial: { json } },
  });
  const depth20 = `${'['.repeat(20)}0${']'.repeat(20)}`;
  const depth21 = `${'['.repeat(21)}0${']'.repeat(21)}`;
  assert.equal(validateLesson(jsonSource, make(depth20)).practice.initial.json, depth20);
  rejectsCode(() => validateLesson(jsonSource, make(depth21)), 'ERR_LESSON_JSON_DEPTH');
  assert.doesNotThrow(() => validateLesson(jsonSource, make(JSON.stringify(Array(999).fill(0)))));
  rejectsCode(() => validateLesson(jsonSource, make(JSON.stringify(Array(1000).fill(0)))), 'ERR_LESSON_JSON_NODES');
});
