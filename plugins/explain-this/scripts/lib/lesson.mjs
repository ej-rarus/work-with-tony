const SOURCE_KINDS = new Set(['md', 'html', 'json']);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireObject(value, code, label) {
  if (!isPlainObject(value)) fail(code, `${label} must be a plain JSON object.`);
  return value;
}

function requireString(value, maxLength, label) {
  if (typeof value !== 'string' || value.length > maxLength) {
    fail('ERR_LESSON_STRING', `${label} must be a string of at most ${maxLength} characters.`);
  }
  return value;
}

function validateSource(source) {
  if (!isPlainObject(source)
    || typeof source.name !== 'string'
    || !SOURCE_KINDS.has(source.kind)
    || typeof source.sha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(source.sha256)
    || typeof source.text !== 'string') {
    fail('ERR_LESSON_SOURCE', 'Source must be the result of readSource().');
  }
}

function findOccurrences(text, quote) {
  const positions = [];
  let from = 0;
  while (from <= text.length - quote.length) {
    const position = text.indexOf(quote, from);
    if (position === -1) break;
    positions.push(position);
    from = position + 1;
  }
  return positions;
}

function lineAt(text, utf16Index) {
  let line = 1;
  for (let index = 0; index < utf16Index; index += 1) {
    if (text[index] === '\r') {
      line += 1;
      if (text[index + 1] === '\n' && index + 1 < utf16Index) index += 1;
    } else if (text[index] === '\n') {
      line += 1;
    }
  }
  return line;
}

function validateSections(source, sections) {
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 12) {
    fail('ERR_LESSON_SECTIONS', 'sections must contain between 1 and 12 entries.');
  }

  let totalQuoteLength = 0;
  return sections.map((section, index) => {
    requireObject(section, 'ERR_LESSON_SECTION', `sections[${index}]`);
    const title = requireString(section.title, 160, `sections[${index}].title`);
    if (typeof section.quote !== 'string') {
      fail('ERR_LESSON_STRING', `sections[${index}].quote must be a string.`);
    }
    const quote = section.quote;
    if (quote.length === 0) fail('ERR_LESSON_QUOTE', `sections[${index}].quote must not be empty.`);
    if (quote.length > 4000) fail('ERR_LESSON_QUOTE_LIMIT', 'Each quote is limited to 4000 characters.');
    totalQuoteLength += quote.length;
    if (totalQuoteLength > 20000) {
      fail('ERR_LESSON_QUOTE_LIMIT', 'All section quotes together are limited to 20000 characters.');
    }
    const explanation = requireString(section.explanation, 3000, `sections[${index}].explanation`);

    const positions = findOccurrences(source.text, quote);
    if (positions.length === 0) {
      fail('ERR_LESSON_QUOTE_NOT_FOUND', `sections[${index}].quote is not an exact source substring.`);
    }
    const hasOccurrence = Object.hasOwn(section, 'occurrence');
    if (!hasOccurrence && positions.length > 1) {
      fail('ERR_LESSON_QUOTE_AMBIGUOUS', `sections[${index}].quote appears more than once; occurrence is required.`);
    }
    let selected = 0;
    if (hasOccurrence) {
      if (!Number.isSafeInteger(section.occurrence)
        || section.occurrence < 1
        || section.occurrence > positions.length) {
        fail('ERR_LESSON_OCCURRENCE', `sections[${index}].occurrence must select an existing one-based occurrence.`);
      }
      selected = section.occurrence - 1;
    }
    const start = positions[selected];
    const end = start + quote.length;
    return {
      title,
      quote,
      explanation,
      start,
      end,
      lineStart: lineAt(source.text, start),
      lineEnd: lineAt(source.text, end - 1),
    };
  });
}

function textInitial(initial, names, label) {
  requireObject(initial, 'ERR_LESSON_INITIAL', label);
  return Object.fromEntries(names.map((name) => [
    name,
    requireString(initial[name], 2000, `${label}.${name}`),
  ]));
}

function inspectJsonTree(root) {
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > 1000) fail('ERR_LESSON_JSON_NODES', 'practice.initial.json is limited to 1000 parsed nodes.');
    if (typeof value === 'number' && !Number.isFinite(value)) {
      fail('ERR_LESSON_JSON_NUMBER', 'practice.initial.json numbers must remain finite when parsed.');
    }
    if (value !== null && typeof value === 'object') {
      const childDepth = depth + 1;
      if (childDepth > 20) fail('ERR_LESSON_JSON_DEPTH', 'practice.initial.json nesting is limited to 20 levels.');
      for (const child of Array.isArray(value) ? value : Object.values(value)) {
        stack.push({ value: child, depth: childDepth });
      }
    }
  }
}

function validateInitial(kind, initial) {
  if (kind === 'html') {
    const result = textInitial(initial, ['heading', 'paragraph', 'buttonText', 'buttonColor'], 'practice.initial');
    if (!/^#[0-9A-Fa-f]{6}$/.test(result.buttonColor)) {
      fail('ERR_LESSON_COLOR', 'practice.initial.buttonColor must be exactly #RRGGBB.');
    }
    return result;
  }

  if (kind === 'md') {
    const result = textInitial(initial, ['heading', 'paragraph', 'linkText', 'linkUrl'], 'practice.initial');
    if (!Array.isArray(initial.items) || initial.items.length > 20) {
      fail('ERR_LESSON_ITEMS', 'practice.initial.items must be an array of at most 20 strings.');
    }
    result.items = initial.items.map((item, index) => requireString(item, 2000, `practice.initial.items[${index}]`));
    return {
      heading: result.heading,
      paragraph: result.paragraph,
      items: result.items,
      linkText: result.linkText,
      linkUrl: result.linkUrl,
    };
  }

  requireObject(initial, 'ERR_LESSON_INITIAL', 'practice.initial');
  if (typeof initial.json !== 'string') {
    fail('ERR_LESSON_STRING', 'practice.initial.json must be a string.');
  }
  if (initial.json.length > 16000) {
    fail('ERR_LESSON_JSON_LIMIT', 'practice.initial.json is limited to 16000 characters.');
  }
  let parsed;
  try {
    parsed = JSON.parse(initial.json);
  } catch {
    fail('ERR_LESSON_JSON', 'practice.initial.json must contain valid JSON text.');
  }
  inspectJsonTree(parsed);
  return { json: initial.json };
}

function validatePractice(source, practice) {
  requireObject(practice, 'ERR_LESSON_PRACTICE', 'practice');
  if (!SOURCE_KINDS.has(practice.kind) || practice.kind !== source.kind) {
    fail('ERR_LESSON_PRACTICE_KIND', 'practice.kind must match the source kind.');
  }
  const task = requireString(practice.task, 600, 'practice.task');
  const hint = requireString(practice.hint, 600, 'practice.hint');
  return {
    kind: practice.kind,
    task,
    hint,
    initial: validateInitial(practice.kind, practice.initial),
  };
}

export function validateLesson(source, candidate) {
  validateSource(source);
  requireObject(candidate, 'ERR_LESSON_SHAPE', 'Lesson candidate');
  if (candidate.version !== 1) fail('ERR_LESSON_VERSION', 'Lesson version must be 1.');
  if (typeof candidate.sourceHash !== 'string' || candidate.sourceHash !== source.sha256) {
    fail('ERR_LESSON_SOURCE_HASH', 'Lesson sourceHash does not match the inspected source.');
  }

  const title = requireString(candidate.title, 160, 'title');
  const summary = requireString(candidate.summary, 2000, 'summary');
  const sections = validateSections(source, candidate.sections);
  const practice = validatePractice(source, candidate.practice);

  return {
    version: 1,
    title,
    summary,
    source: { name: source.name, kind: source.kind, sha256: source.sha256 },
    sections,
    practice,
  };
}
