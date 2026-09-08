import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, readdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { prepareRelease, applyRelease } from '../scripts/lib/prepare.mjs';
import { parseArgs } from '../scripts/release.mjs';
import { gitState } from '../scripts/lib/runtime.mjs';

const cli = fileURLToPath(new URL('../scripts/release.mjs', import.meta.url));
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
function write(root, file, value) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}
function git(repo, args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'tony-release-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const manifest = { name: 'demo', version: '0.1.0', description: 'A demonstration plugin', author: { name: 'Example' }, repository: 'https://github.com/example/repo', license: 'MIT' };
  write(repo, 'plugins/demo/.claude-plugin/plugin.json', manifest);
  write(repo, 'plugins/demo/.codex-plugin/plugin.json', {
    ...manifest, skills: './skills/', interface: {
      displayName: 'Demo', shortDescription: 'A demo plugin', longDescription: 'A demo plugin for release fixtures',
      developerName: 'Example', category: 'Productivity', capabilities: ['Interactive'], defaultPrompt: ['Use demo'],
    },
  });
  write(repo, 'plugins/demo/skills/run/SKILL.md', '---\nname: run\ndescription: Run the demo operation.\n---\n\n# Demo\n\nExecute the requested demo.\n');
  write(repo, 'plugins/demo/README.md', '# Demo\n');
  write(repo, 'plugins/demo/package.json', { name: 'demo-plugin', version: '0.1.0', type: 'module', scripts: { test: 'node test.mjs' }, customField: 'preserve me' });
  write(repo, 'plugins/demo/test.mjs', "import { writeFileSync } from 'node:fs'; writeFileSync('test-ran.txt', 'yes');\n");
  write(repo, '.claude-plugin/marketplace.json', { name: 'example', owner: { name: 'Example' }, description: 'Example catalog', plugins: [{ name: 'demo', source: './plugins/demo', version: '0.1.0', description: manifest.description, customField: 'keep entry' }] });
  write(repo, '.agents/plugins/marketplace.json', { name: 'example', interface: { displayName: 'Example catalog' }, plugins: [{ name: 'demo', source: { source: 'local', path: './plugins/demo' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }] });
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Release Test']);
  git(repo, ['config', 'user.email', 'release-test@example.invalid']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-m', 'initial fixture']);
  return repo;
}
function run(repo, command, args = [], env = {}) {
  const result = spawnSync(process.execPath, [cli, command, '--repo', repo, ...args, '--json'], {
    encoding: 'utf8', env: { ...process.env, PLUGIN_RELEASE_TEST_DEPTH: '', ...env }, timeout: 15_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return { exitCode: result.status, report: JSON.parse(result.stdout), stderr: result.stderr };
}

test('CLI rejects ambiguous selection and write flags on read-only check', () => {
  for (const args of [
    ['check'], ['check', '--repo', '/tmp', '--plugin', '../bad'], ['check', '--repo', '/tmp', '--all', '--plugin', 'demo'],
    ['check', '--repo', '/tmp', '--write'], ['check', '--repo', '/tmp', '--repo', '/tmp'], ['prepare', '--repo', '/tmp'],
    ['prepare', '--repo', '/tmp', '--plugin', 'demo', '--tests'], ['check', '--repo', '/tmp', '--surprise'],
  ]) assert.throws(() => parseArgs(args));
});

test('static check reports unrun tests and does not execute the package script', (t) => {
  const repo = fixture(t);
  const { exitCode, report } = run(repo, 'check', ['--all']);
  assert.equal(exitCode, 0, JSON.stringify(report));
  assert.equal(report.status, 'incomplete');
  assert.equal(report.tests[0].status, 'not_run');
  assert.equal(report.git.clean, true);
  assert.equal(report.published, false);
  assert.equal(existsSync(join(repo, 'plugins/demo/test-ran.txt')), false);
});

test('check executes selected tests and reports their actual result', (t) => {
  const repo = fixture(t);
  const { exitCode, report } = run(repo, 'check', ['--plugin', 'demo', '--tests']);
  assert.equal(exitCode, 0, JSON.stringify(report));
  assert.equal(report.tests[0].status, 'passed');
  assert.equal(readFileSync(join(repo, 'plugins/demo/test-ran.txt'), 'utf8'), 'yes');
  assert.equal(report.git.clean, false);
  assert.ok(report.git.changes.some((change) => change.path === 'plugins/demo/test-ran.txt'));
});

test('test failures propagate to JSON and the process exit code', (t) => {
  const repo = fixture(t);
  write(repo, 'plugins/demo/test.mjs', "console.error('intentional fixture failure'); process.exitCode = 1;\n");
  const { exitCode, report, stderr } = run(repo, 'check', ['--tests']);
  assert.equal(exitCode, 1);
  assert.equal(report.status, 'failed');
  assert.equal(report.tests[0].status, 'failed');
  assert.ok(stderr.includes('intentional fixture failure'));
});

test('successful tests cannot hide metadata they invalidated during execution', (t) => {
  const repo = fixture(t);
  write(repo, 'plugins/demo/test.mjs', "import { writeFileSync } from 'node:fs'; writeFileSync('.claude-plugin/plugin.json', '{}');\n");
  const { exitCode, report } = run(repo, 'check', ['--tests']);
  assert.equal(report.tests[0].status, 'passed');
  assert.equal(exitCode, 1);
  assert.equal(report.status, 'failed');
  assert.ok(report.issues.some((issue) => issue.level === 'error'));
});

test('requested tests with no test script are incomplete, never passed', (t) => {
  const repo = fixture(t);
  const pkg = json(join(repo, 'plugins/demo/package.json'));
  delete pkg.scripts;
  write(repo, 'plugins/demo/package.json', pkg);
  const { exitCode, report } = run(repo, 'check', ['--tests']);
  assert.equal(exitCode, 1);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.tests[0].status, 'not_run');
});

test('an explicitly requested missing native validator remains incomplete', (t) => {
  const repo = fixture(t);
  const { exitCode, report } = run(repo, 'check', ['--native'], { PATH: join(repo, 'no-cli') });
  assert.equal(exitCode, 1);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.native.find((item) => item.host === 'claude').status, 'not_run');
});

test('native validator failures propagate without a shell invocation', (t) => {
  const repo = fixture(t);
  write(repo, 'bin/claude', `#!${process.execPath}\nconsole.error('native fixture rejection'); process.exit(1);\n`);
  chmodSync(join(repo, 'bin/claude'), 0o755);
  const { exitCode, report, stderr } = run(repo, 'check', ['--native'], { PATH: join(repo, 'bin') });
  assert.equal(exitCode, 1);
  assert.equal(report.status, 'failed');
  assert.equal(report.native.find((item) => item.host === 'claude').status, 'failed');
  assert.match(stderr, /native fixture rejection/);
});

test('inherited recursion marker blocks nested test execution', (t) => {
  const repo = fixture(t);
  const { exitCode, report } = run(repo, 'check', ['--tests'], { PLUGIN_RELEASE_TEST_DEPTH: '1' });
  assert.equal(exitCode, 2);
  assert.match(report.error, /Recursive/);
  assert.equal(existsSync(join(repo, 'plugins/demo/test-ran.txt')), false);
});

test('prepare previews four version updates with no filesystem changes', (t) => {
  const repo = fixture(t);
  const result = run(repo, 'prepare', ['--plugin', 'demo', '--version', '0.2.0']);
  assert.equal(result.exitCode, 0, JSON.stringify(result.report));
  assert.equal(result.report.mode, 'preview');
  assert.equal(result.report.changes.length, 4);
  assert.equal(gitState(repo).clean, true);
  assert.equal(json(join(repo, 'plugins/demo/package.json')).version, '0.1.0');
});

test('write synchronizes versions and preserves unrelated data and Codex catalog', (t) => {
  const repo = fixture(t);
  write(repo, 'user-note.txt', 'unrelated user work');
  const codexCatalog = readFileSync(join(repo, '.agents/plugins/marketplace.json'), 'utf8');
  const { exitCode, report } = run(repo, 'prepare', ['--plugin', 'demo', '--version', '0.2.0', '--write']);
  assert.equal(exitCode, 0, JSON.stringify(report));
  assert.equal(report.mode, 'written');
  assert.equal(report.git.clean, false);
  for (const file of ['plugins/demo/package.json', 'plugins/demo/.claude-plugin/plugin.json', 'plugins/demo/.codex-plugin/plugin.json']) assert.equal(json(join(repo, file)).version, '0.2.0');
  const entry = json(join(repo, '.claude-plugin/marketplace.json')).plugins[0];
  assert.equal(entry.version, '0.2.0');
  assert.equal(entry.customField, 'keep entry');
  assert.equal(json(join(repo, 'plugins/demo/package.json')).customField, 'preserve me');
  assert.equal(readFileSync(join(repo, '.agents/plugins/marketplace.json'), 'utf8'), codexCatalog);
  assert.equal(readFileSync(join(repo, 'user-note.txt'), 'utf8'), 'unrelated user work');
  assert.equal(run(repo, 'check').exitCode, 0);
});

test('registration-only preparation restores missing entries without version changes', (t) => {
  const repo = fixture(t);
  for (const file of ['.agents/plugins/marketplace.json', '.claude-plugin/marketplace.json']) {
    const market = json(join(repo, file)); market.plugins = []; write(repo, file, market);
  }
  const { exitCode, report } = run(repo, 'prepare', ['--plugin', 'demo', '--write']);
  assert.equal(exitCode, 0, JSON.stringify(report));
  assert.equal(report.changes.length, 2);
  assert.equal(json(join(repo, 'plugins/demo/package.json')).version, '0.1.0');
  assert.equal(json(join(repo, '.agents/plugins/marketplace.json')).plugins[0].name, 'demo');
  assert.equal(run(repo, 'check').exitCode, 0);
});

test('same-name external catalog entries block preparation before any writes', (t) => {
  for (const catalog of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json']) {
    const repo = fixture(t);
    const market = json(join(repo, catalog));
    market.plugins[0].source = { source: 'github', repo: 'someone/remote-demo' };
    write(repo, catalog, market);
    const before = git(repo, ['diff']);
    const { exitCode, report } = run(repo, 'prepare', ['--plugin', 'demo', '--version', '0.2.0', '--write']);
    assert.equal(exitCode, 1);
    assert.equal(report.ok, false);
    assert.deepEqual(report.changes, []);
    assert.ok(report.issues.some((issue) => issue.code === 'MARKETPLACE_SOURCE_CONFLICT'));
    assert.equal(git(repo, ['diff']), before);
    assert.equal(json(join(repo, 'plugins/demo/package.json')).version, '0.1.0');
  }
});

test('already registered plugin produces a byte-preserving no-op', (t) => {
  const repo = fixture(t);
  const { exitCode, report } = run(repo, 'prepare', ['--plugin', 'demo', '--write']);
  assert.equal(exitCode, 0, JSON.stringify(report));
  assert.deepEqual(report.changes, []);
  assert.equal(gitState(repo).clean, true);
});

test('invalid, equal and lower versions are rejected before any writes', (t) => {
  const repo = fixture(t);
  for (const version of ['0.1.0', '0.0.9', 'not-semver', '01.2.3']) {
    const { exitCode } = run(repo, 'prepare', ['--plugin', 'demo', '--version', version, '--write']);
    assert.notEqual(exitCode, 0);
    assert.equal(gitState(repo).clean, true);
  }
});

test('manifest version drift blocks prepare without partial catalog changes', (t) => {
  const repo = fixture(t);
  const file = 'plugins/demo/.claude-plugin/plugin.json';
  const manifest = json(join(repo, file)); manifest.version = '0.2.0'; write(repo, file, manifest);
  const before = git(repo, ['diff']);
  const { exitCode } = run(repo, 'prepare', ['--plugin', 'demo', '--version', '0.3.0', '--write']);
  assert.notEqual(exitCode, 0);
  assert.equal(git(repo, ['diff']), before);
});

test('staged target metadata blocks writing but static checks still work', (t) => {
  const repo = fixture(t);
  const file = 'plugins/demo/package.json';
  const pkg = json(join(repo, file)); pkg.customField = 'staged user change'; write(repo, file, pkg);
  git(repo, ['add', file]);
  const staged = git(repo, ['diff', '--cached']);
  const { exitCode, report } = run(repo, 'prepare', ['--plugin', 'demo', '--version', '0.2.0', '--write']);
  assert.equal(exitCode, 2);
  assert.match(report.error, /staged/);
  assert.equal(git(repo, ['diff', '--cached']), staged);
  assert.equal(run(repo, 'check').exitCode, 0);
});

test('apply detects concurrent edits after the preview', (t) => {
  const repo = fixture(t);
  const plan = prepareRelease({ repo, plugin: 'demo', version: '0.2.0' });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  write(repo, 'plugins/demo/package.json', { ...json(join(repo, 'plugins/demo/package.json')), customField: 'changed since preview' });
  assert.throws(() => applyRelease(plan), /changed after preview/);
  assert.equal(json(join(repo, 'plugins/demo/.claude-plugin/plugin.json')).version, '0.1.0');
});

test('symlinked release metadata is refused and outside file stays unchanged', (t) => {
  const repo = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'tony-release-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const file = join(repo, 'plugins/demo/package.json');
  const before = readFileSync(file, 'utf8');
  write(outside, 'package.json', before);
  rmSync(file);
  symlinkSync(join(outside, 'package.json'), file);
  const { exitCode } = run(repo, 'prepare', ['--plugin', 'demo', '--version', '0.2.0', '--write']);
  assert.notEqual(exitCode, 0);
  assert.equal(readFileSync(join(outside, 'package.json'), 'utf8'), before);
});

test('Git status preserves paths with spaces and reports untracked work', (t) => {
  const repo = fixture(t);
  write(repo, 'my note.txt', 'a note');
  const state = gitState(repo);
  assert.equal(state.clean, false);
  assert.deepEqual(state.changes, [{ status: '??', path: 'my note.txt' }]);
});

test('nested directories are not silently treated as the source repository', (t) => {
  const repo = fixture(t);
  assert.throws(() => gitState(join(repo, 'plugins/demo')), /repository root/);
});

test('write cleans up temporary files', (t) => {
  const repo = fixture(t);
  const plan = prepareRelease({ repo, plugin: 'demo', version: '0.2.0' });
  const applied = applyRelease(plan);
  assert.equal(applied.git.clean, false);
  for (const directory of ['.claude-plugin', 'plugins/demo', 'plugins/demo/.claude-plugin', 'plugins/demo/.codex-plugin']) assert.equal(readdirSync(join(repo, directory)).some((name) => name.startsWith('.plugin-release-')), false);
});

test('a mid-batch rename failure rolls back files already replaced', (t) => {
  const repo = fixture(t);
  const plan = prepareRelease({ repo, plugin: 'demo', version: '0.2.0' });
  const rename = fs.renameSync;
  let renames = 0;
  const mocked = t.mock.method(fs, 'renameSync', (...args) => {
    if (++renames === 2) throw new Error('simulated filesystem rename failure');
    return rename(...args);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => applyRelease(plan), /simulated filesystem rename failure/);
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
  for (const change of plan.changes) assert.equal(readFileSync(join(repo, change.path), 'utf8'), change.before);
  assert.equal(gitState(repo).clean, true);
  for (const directory of ['.claude-plugin', 'plugins/demo', 'plugins/demo/.claude-plugin', 'plugins/demo/.codex-plugin']) assert.equal(readdirSync(join(repo, directory)).some((name) => name.startsWith('.plugin-release-')), false);
});
