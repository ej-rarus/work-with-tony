(() => {
  'use strict';
  const lesson = JSON.parse(document.getElementById('lesson-data').textContent);
  const byId = id => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  const el = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  const format = { html: 'HTML', md: 'Markdown', json: 'JSON' }[lesson.practice.kind];
  text('source-file', lesson.source.name);
  text('lesson-title', lesson.title);
  text('lesson-summary', lesson.summary);
  text('source-kind', `${format} 원문`);
  text('practice-task', lesson.practice.task);
  text('practice-hint', lesson.practice.hint);
  document.querySelectorAll('.code-kind').forEach(node => { node.textContent = format; });

  lesson.sections.forEach(section => {
    const article = el('article', undefined, 'source-section');
    const quoteArea = el('div');
    const label = el('div', undefined, 'quote-label');
    label.append(el('span', '파일에서 가져온 원문'));
    label.append(el('span', section.lineStart === section.lineEnd ? `${section.lineStart}행` : `${section.lineStart}–${section.lineEnd}행`));
    const quote = el('pre', undefined, 'source-quote');
    quote.tabIndex = 0;
    quote.setAttribute('aria-label', `${section.title} 원문`);
    quote.append(el('code', section.quote));
    quoteArea.append(label, quote);
    const explanation = el('div');
    explanation.append(el('h3', section.title, 'explanation-title'), el('p', section.explanation, 'explanation-body'));
    article.append(quoteArea, explanation);
    byId('source-sections').append(article);
  });

  const initial = lesson.practice.initial;
  const controls = new Map();
  let itemInputs = [];
  function field(key, label, options = {}) {
    const wrapper = el('div', undefined, 'field');
    const labelNode = el('label', label);
    labelNode.htmlFor = key;
    // Textareas preserve literal newlines, including in headings and link text.
    const input = el(options.color ? 'input' : 'textarea');
    input.id = key;
    input.name = key;
    input.maxLength = options.maxLength || 2000;
    input.spellcheck = false;
    input.autocomplete = 'off';
    if (options.color) input.type = 'text';
    else if (!options.multiline) { input.rows = 1; input.className = 'short-input'; }
    if (options.code) input.className = 'code-input';
    if (options.placeholder) input.placeholder = options.placeholder;
    input.value = initial[key];
    input.addEventListener('input', update);
    wrapper.append(labelNode, input);
    if (options.help) {
      const help = el('p', options.help, 'field-help');
      help.id = `${key}-help`;
      input.setAttribute('aria-describedby', help.id);
      wrapper.append(help);
    }
    controls.set(key, input);
    byId('editor-fields').append(wrapper);
  }

  const kind = lesson.practice.kind;
  function listFields(items) {
    const container = byId('items');
    container.replaceChildren();
    itemInputs = [];
    items.forEach((value, index) => {
      const row = el('div', undefined, 'list-field-row');
      const label = el('label', `항목 ${index + 1}`);
      label.htmlFor = `items-${index}`;
      const input = el('textarea');
      input.id = `items-${index}`;
      input.rows = 2;
      input.maxLength = 2000;
      input.value = value;
      input.addEventListener('input', update);
      const remove = el('button', '삭제', 'list-button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `목록 항목 ${index + 1} 삭제`);
      remove.addEventListener('click', () => {
        const next = itemInputs.map(item => item.value);
        next.splice(index, 1);
        listFields(next);
        update();
        (itemInputs[Math.min(index, itemInputs.length - 1)] || byId('add-item')).focus();
      });
      row.append(label, input, remove);
      itemInputs.push(input);
      container.append(row);
    });
    const add = el('button', '목록 항목 추가', 'list-button');
    add.id = 'add-item';
    add.type = 'button';
    add.disabled = items.length >= 20;
    add.addEventListener('click', () => {
      listFields([...itemInputs.map(item => item.value), '']);
      update();
      itemInputs.at(-1).focus();
    });
    container.append(add);
  }
  if (kind === 'html') {
    field('heading', '제목');
    field('paragraph', '본문', { multiline: true });
    field('buttonText', '버튼 문구');
    field('buttonColor', '버튼 색상', { color: true, maxLength: 7, placeholder: '#2457E6', help: '#과 6자리 색상값을 입력하세요. 예: #2457E6' });
  } else if (kind === 'md') {
    field('heading', '제목');
    field('paragraph', '본문', { multiline: true });
    const group = el('fieldset', undefined, 'field list-fields');
    group.append(el('legend', '목록'), el('p', '항목을 추가하거나 삭제할 수 있습니다. 최대 20개.', 'field-help'));
    const container = el('div');
    container.id = 'items';
    group.append(container);
    byId('editor-fields').append(group);
    listFields(initial.items);
    field('linkText', '링크 문구');
    field('linkUrl', '링크 주소', { help: '주소는 글자로만 표시됩니다. 링크를 열거나 접속하지 않습니다.' });
  } else {
    field('json', 'JSON 내용', { multiline: true, code: true, maxLength: 16000, help: '키와 문자열은 큰따옴표로 감싸세요. 마지막 항목 뒤에는 쉼표를 붙이지 않습니다.' });
  }

  const htmlText = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const mdText = value => value.replace(/[\\`*_{}\[\]()#+.!<>~-]/g, '\\$&');
  function exampleCode(value) {
    if (kind === 'html') return `<section>\n  <h1>${htmlText(value.heading)}</h1>\n  <p>${htmlText(value.paragraph)}</p>\n  <button style="background-color: ${value.buttonColor}; color: ${contrastingInk(value.buttonColor)}">\n    ${htmlText(value.buttonText)}\n  </button>\n</section>`;
    if (kind === 'md') return `# ${mdText(value.heading)}\n\n${mdText(value.paragraph)}\n\n${value.items.map(item => `- ${mdText(item)}`).join('\n')}\n\n[${mdText(value.linkText)}](${value.linkUrl.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')})`;
    return JSON.stringify(JSON.parse(value.json), null, 2);
  }

  function contrastingInk(hex) {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return (.2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]) > .179 ? '#000000' : '#FFFFFF';
  }

  function jsonTree(value) {
    const list = el('ul', undefined, 'json-tree');
    if (value === null || typeof value !== 'object') {
      list.append(el('li', JSON.stringify(value), 'json-value'));
      return list;
    }
    const entries = Object.entries(value);
    if (entries.length === 0) list.append(el('li', Array.isArray(value) ? '[]' : '{}', 'json-value'));
    entries.forEach(([key, child]) => {
      const row = el('li');
      row.append(el('span', `${Array.isArray(value) ? `[${key}]` : key}: `, 'json-key'));
      if (child !== null && typeof child === 'object') {
        row.append(el('span', Array.isArray(child) ? '배열' : '객체', 'json-value'), jsonTree(child));
      } else row.append(el('span', JSON.stringify(child), 'json-value'));
      list.append(row);
    });
    return list;
  }

  function preview(target, value) {
    target.replaceChildren();
    if (kind === 'json') {
      const parsed = JSON.parse(value.json);
      const type = parsed === null ? 'null' : Array.isArray(parsed) ? `배열 · ${parsed.length}개 항목` : typeof parsed === 'object' ? `객체 · ${Object.keys(parsed).length}개 속성` : { string: '문자열', number: '숫자', boolean: '참 / 거짓' }[typeof parsed];
      target.append(el('p', type, 'json-type'), jsonTree(parsed));
      return;
    }
    target.append(el('h4', value.heading, 'preview-heading'), el('p', value.paragraph, 'preview-paragraph'));
    if (kind === 'html') {
      // A visual example, not an interactive source button. Only a validated color property is set.
      const button = el('span', value.buttonText, 'preview-button');
      button.style.backgroundColor = value.buttonColor;
      button.style.color = contrastingInk(value.buttonColor);
      target.append(button);
    } else {
      const list = el('ul', undefined, 'preview-list');
      value.items.forEach(item => list.append(el('li', item)));
      const link = el('p', undefined, 'preview-link');
      link.append(el('span', value.linkText, 'preview-link-title'), el('span', value.linkUrl, 'preview-link-url'));
      target.append(list, link);
    }
  }

  function readValue() {
    const value = {};
    for (const [key, input] of controls) value[key] = input.value;
    if (kind === 'md') value.items = itemInputs.map(input => input.value);
    return value;
  }

  function validate(value) {
    if (kind === 'html' && !/^#[0-9a-fA-F]{6}$/.test(value.buttonColor)) return { key: 'buttonColor', message: '색상은 #과 6자리 16진수로 입력하세요. 예: #2457E6' };
    if (kind === 'md' && (value.items.length > 20 || value.items.some(item => item.length > 2000))) return { key: 'items', message: '목록은 최대 20개, 각 항목은 2,000자 이내로 입력하세요.' };
    if (kind === 'json') {
      if (value.json.length > 16000) return { key: 'json', message: 'JSON은 16,000자 이내로 입력하세요.' };
      try {
        const parsed = JSON.parse(value.json);
        const stack = [{ value: parsed, depth: 0 }];
        let nodes = 0;
        while (stack.length) {
          const entry = stack.pop();
          nodes += 1;
          if (nodes > 1000) return { key: 'json', message: '예제는 최대 20단계 깊이, 1,000개 값까지 사용할 수 있습니다.' };
          if (typeof entry.value === 'number' && !Number.isFinite(entry.value)) return { key: 'json', message: '숫자가 지원 범위를 벗어났습니다. 이 학습 화면에서 계산할 수 있는 유한한 숫자로 줄여 주세요. (절댓값 약 1.7976931348623157e308 이하)' };
          if (entry.value !== null && typeof entry.value === 'object') {
            // Match build validation: only array/object containers add a level.
            const childDepth = entry.depth + 1;
            if (childDepth > 20) return { key: 'json', message: '예제는 최대 20단계 깊이, 1,000개 값까지 사용할 수 있습니다.' };
            Object.values(entry.value).forEach(child => stack.push({ value: child, depth: childDepth }));
          }
        }
      } catch (error) {
        return { key: 'json', message: `JSON 문법을 확인하세요. 큰따옴표, 쉼표, 괄호의 짝을 살펴보세요.\n${error.message.slice(0, 220)}` };
      }
    }
    return null;
  }

  function update() {
    const value = readValue();
    const error = validate(value);
    for (const [key, input] of controls) {
      input.setAttribute('aria-invalid', String(error?.key === key));
      const help = byId(`${key}-help`);
      if (error?.key === key) input.setAttribute('aria-describedby', `${help ? `${help.id} ` : ''}input-error`);
      else if (help) input.setAttribute('aria-describedby', help.id);
      else input.removeAttribute('aria-describedby');
    }
    byId('input-error').hidden = !error;
    text('input-error', error ? error.message : '');
    if (error) {
      byId('after-preview').replaceChildren(el('p', '입력을 확인하면 수정 후 화면이 여기에 나타납니다. 현재 입력은 유효한 결과가 아닙니다.', 'preview-error'));
      text('after-code', kind === 'json' ? value.json : '입력 오류를 고치면 예제 코드가 나타납니다.');
      text('after-code-label', kind === 'json' ? '입력 중인 JSON (오류 있음)' : '예제 코드 (생성 보류)');
      text('after-state', '입력 확인 필요');
      text('edit-status', '입력 오류가 있습니다. 수정 전 예제는 그대로 유지됩니다.');
      return;
    }
    preview(byId('after-preview'), value);
    text('after-code', exampleCode(value));
    text('after-code-label', '예제 코드');
    const changed = Object.keys(initial).some(key => JSON.stringify(value[key]) !== JSON.stringify(initial[key]));
    text('after-state', changed ? '수정됨' : '처음과 같음');
    text('edit-status', changed ? '수정 후 화면과 코드에 반영했습니다.' : '아직 바꾼 내용이 없습니다.');
  }

  byId('reset').addEventListener('click', () => {
    for (const [key, input] of controls) input.value = initial[key];
    if (kind === 'md') listFields(initial.items);
    update();
    text('edit-status', '처음 상태로 되돌렸습니다.');
  });
  preview(byId('before-preview'), initial);
  text('before-code', exampleCode(initial));
  update();
})();
