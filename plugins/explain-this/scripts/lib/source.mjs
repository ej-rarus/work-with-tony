import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const MAX_BYTES = 131072;
const SOURCE_KINDS = new Map([
  ['.md', 'md'],
  ['.html', 'html'],
  ['.json', 'json'],
]);

function fail(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  throw error;
}

function validatePath(file, prefix) {
  if (typeof file !== 'string' || file.length === 0) {
    fail(`ERR_${prefix}_PATH`, 'File path must be a nonempty string.');
  }
}

function mapFilesystemError(error, prefix, file) {
  if (error?.code === 'ENOENT') {
    fail(`ERR_${prefix}_NOT_FOUND`, `File does not exist: ${file}`, error);
  }
  if (error?.code === 'ELOOP') {
    fail(`ERR_${prefix}_SYMLINK`, `Final path component must not be a symbolic link: ${file}`, error);
  }
  fail(`ERR_${prefix}_IO`, `Unable to read file: ${file}`, error);
}

function readBoundedUtf8(file, prefix) {
  validatePath(file, prefix);

  let before;
  try {
    before = lstatSync(file);
  } catch (error) {
    mapFilesystemError(error, prefix, file);
  }
  if (before.isSymbolicLink()) {
    fail(`ERR_${prefix}_SYMLINK`, `Final path component must not be a symbolic link: ${file}`);
  }
  if (!before.isFile()) {
    fail(`ERR_${prefix}_NOT_FILE`, `Path must identify a regular file: ${file}`);
  }
  if (before.size > MAX_BYTES) {
    fail(`ERR_${prefix}_TOO_LARGE`, `File exceeds the ${MAX_BYTES}-byte limit: ${file}`);
  }

  let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    mapFilesystemError(error, prefix, file);
  }

  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) {
      fail(`ERR_${prefix}_NOT_FILE`, `Path must identify a regular file: ${file}`);
    }
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      fail(`ERR_${prefix}_IO`, `File changed while it was being opened: ${file}`);
    }
    if (opened.size > MAX_BYTES) {
      fail(`ERR_${prefix}_TOO_LARGE`, `File exceeds the ${MAX_BYTES}-byte limit: ${file}`);
    }

    // Read at most one byte beyond the limit so a growing file cannot bypass the
    // size check or cause an unbounded allocation.
    const storage = Buffer.allocUnsafe(MAX_BYTES + 1);
    let byteLength = 0;
    while (byteLength < storage.length) {
      const count = readSync(descriptor, storage, byteLength, storage.length - byteLength, null);
      if (count === 0) break;
      byteLength += count;
    }
    if (byteLength > MAX_BYTES) {
      fail(`ERR_${prefix}_TOO_LARGE`, `File exceeds the ${MAX_BYTES}-byte limit: ${file}`);
    }

    const bytes = storage.subarray(0, byteLength);
    if (bytes.includes(0)) {
      fail(`ERR_${prefix}_BINARY`, `File contains a binary NUL byte: ${file}`);
    }
    let text;
    try {
      // ignoreBOM preserves a leading U+FEFF, matching Node's ordinary UTF-8
      // string decoding instead of silently changing the source text.
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (error) {
      fail(`ERR_${prefix}_UTF8`, `File is not valid UTF-8: ${file}`, error);
    }
    return { bytes, text, byteLength };
  } catch (error) {
    if (typeof error?.code === 'string' && error.code.startsWith(`ERR_${prefix}_`)) throw error;
    mapFilesystemError(error, prefix, file);
  } finally {
    closeSync(descriptor);
  }
}

function countLines(text) {
  let count = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\r') {
      count += 1;
      if (text[index + 1] === '\n') index += 1;
    } else if (text[index] === '\n') {
      count += 1;
    }
  }
  return count;
}

export function readSource(file) {
  const data = readBoundedUtf8(file, 'SOURCE');
  const extension = path.extname(file);
  const kind = SOURCE_KINDS.get(extension);
  if (!kind) {
    fail('ERR_SOURCE_EXTENSION', 'Supported source extensions are .md, .html, and .json.');
  }
  return {
    name: path.basename(file),
    kind,
    sha256: createHash('sha256').update(data.bytes).digest('hex'),
    text: data.text,
    byteLength: data.byteLength,
    lineCount: countLines(data.text),
  };
}

export function readJsonFile(file) {
  const { text } = readBoundedUtf8(file, 'JSON');
  try {
    return JSON.parse(text);
  } catch (error) {
    fail('ERR_JSON_PARSE', `File is not valid JSON: ${file}`, error);
  }
}
