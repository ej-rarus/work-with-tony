#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, lstatSync, realpathSync, unlinkSync, rmdirSync } from 'node:fs';
import { resolve, dirname, basename, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSource, readJsonFile } from './lib/source.mjs';
import { validateLesson } from './lib/lesson.mjs';
import { renderLesson } from './lib/render.mjs';

const HELP = `Explain This — 내 파일로 배우는 IT\n\ninspect --file PATH [--json]\nbuild --file PATH --lesson PATH --out NEW_DIRECTORY [--json]\n\nSupports .md, .html, .json UTF-8 files up to 128 KiB.\nBuilds a reconstructed learning example; never executes or overwrites the source.\nOutput must be a new directory under an existing parent, outside the installed plugin.\n`;
function fail(code, message) { throw Object.assign(new Error(message), { code }); }

export function parseArgs(argv) {
  if (!argv.length || (argv.length === 1 && ['-h', '--help', 'help'].includes(argv[0]))) return { help: true };
  const [command, ...tokens] = argv;
  if (!['inspect', 'build'].includes(command)) fail('ERR_USAGE', `Unknown command: ${command}`);
  const result = { command };
  const seen = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const flag = tokens[i];
    if (!['--file', '--lesson', '--out', '--json'].includes(flag)) fail('ERR_USAGE', `Unknown option: ${flag}`);
    if (seen.has(flag)) fail('ERR_USAGE', `Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--json') { result.json = true; continue; }
    const value = tokens[++i];
    if (!value || value.startsWith('--')) fail('ERR_USAGE', `Missing value: ${flag}`);
    result[flag.slice(2)] = resolve(value);
  }
  if (!result.file) fail('ERR_USAGE', '--file is required.');
  if (command === 'build' && (!result.lesson || !result.out)) fail('ERR_USAGE', 'build requires --file, --lesson and --out.');
  if (command === 'inspect' && (result.lesson || result.out)) fail('ERR_USAGE', '--lesson and --out belong to build.');
  return result;
}

function sameEntry(file, identity) {
  const stat = lstatSync(file);
  return stat.dev === identity.dev && stat.ino === identity.ino && !stat.isSymbolicLink();
}

export function buildLesson({ file, lesson, out }) {
  const source = readSource(file);
  const canonical = validateLesson(source, readJsonFile(lesson));
  const html = renderLesson(canonical);
  const absolute = resolve(out);
  let parent;
  try { parent = realpathSync(dirname(absolute)); }
  catch { fail('ERR_OUTPUT_PARENT', 'Output parent must already exist. Choose a new folder inside an existing directory.'); }
  if (!lstatSync(parent).isDirectory()) fail('ERR_OUTPUT_PARENT', 'Output parent must be a directory.');
  const outputDir = join(parent, basename(absolute));
  const pluginRoot = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
  if (outputDir === pluginRoot || outputDir.startsWith(`${pluginRoot}${sep}`)) fail('ERR_OUTPUT_PLUGIN', 'Choose an output directory outside the installed plugin.');
  if (readSource(file).sha256 !== source.sha256) fail('ERR_SOURCE_CHANGED', 'Source changed during preparation. Inspect it again and rebuild the lesson.');
  try { mkdirSync(outputDir, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') fail('ERR_OUTPUT_EXISTS', 'Output already exists; choose a new directory. No existing files were changed.');
    throw error;
  }
  const directoryIdentity = lstatSync(outputDir);
  const created = [];
  try {
    for (const [name, content] of [['index.html', html], ['lesson.json', `${JSON.stringify(canonical, null, 2)}\n`]]) {
      if (!sameEntry(outputDir, directoryIdentity)) fail('ERR_OUTPUT_CHANGED', 'Output directory was replaced during the build.');
      const target = join(outputDir, name);
      writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
      created.push({ path: target, identity: lstatSync(target), content });
    }
    if (readSource(file).sha256 !== source.sha256) fail('ERR_SOURCE_CHANGED', 'Source changed during the build. Inspect it again and rebuild the lesson.');
    return {
      ok: true, outputDir, files: created.map(item => item.path),
      source: canonical.source, originalPreserved: true,
    };
  } catch (error) {
    let cleaned = true;
    try {
      if (!sameEntry(outputDir, directoryIdentity)) throw new Error('output was replaced');
      for (const item of created) {
        if (sameEntry(item.path, item.identity) && readFileSync(item.path, 'utf8') === item.content) unlinkSync(item.path);
        else cleaned = false;
      }
      rmdirSync(outputDir); // Fails safely if someone added another file.
    } catch { cleaned = false; }
    if (!cleaned) error.message += ` Partial output may remain at ${outputDir}; inspect it before removing anything.`;
    throw error;
  }
}

export function main(argv = process.argv.slice(2)) {
  try {
    if (Number(process.versions.node.split('.')[0]) < 20) fail('ERR_NODE_VERSION', 'Node.js 20 or newer is required.');
    const options = parseArgs(argv);
    if (options.help) { process.stdout.write(HELP); return 0; }
    const result = options.command === 'inspect' ? { ok: true, source: readSource(options.file) } : buildLesson(options);
    if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else if (options.command === 'inspect') process.stdout.write(`${result.source.name} (${result.source.kind}, ${result.source.byteLength} bytes)\nSHA-256: ${result.source.sha256}\n\n${result.source.text}\n`);
    else process.stdout.write(`Lesson created: ${join(result.outputDir, 'index.html')}\nSource preserved. This is a reconstructed exercise, not a rendering of the original file.\n`);
    return 0;
  } catch (error) {
    const result = { ok: false, error: { code: error.code ?? 'ERR_BUILD', message: error.message } };
    process.stdout.write(argv.includes('--json') ? `${JSON.stringify(result)}\n` : `${result.error.code}: ${result.error.message}\n`);
    return error.code === 'ERR_USAGE' ? 2 : 1;
  }
}

// Node resolves module URLs through symlinks (for example macOS /var -> /private/var).
// Compare real paths so a normal copied installation still runs its CLI entrypoint.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main();
