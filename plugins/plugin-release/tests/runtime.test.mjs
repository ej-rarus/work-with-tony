import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { executeNative, executeTests, runCommand } from '../scripts/lib/runtime.mjs';

const posix = { skip: process.platform === 'win32' ? 'POSIX process groups are not available on Windows.' : false };

function fixture(t, { flood = false, command = 'parent.mjs' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'tony-release-process-'));
  const pidFile = join(directory, 'pids.json');
  const script = join(directory, command);
  const source = `#!${process.execPath}
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' });
writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ parent: process.pid, child: child.pid }));
${flood ? "process.stdout.write('x'.repeat(4 * 1024 * 1024));" : ''}
setTimeout(() => {}, 5000);
`;
  writeFileSync(script, source);
  chmodSync(script, 0o755);
  // Extensionless fake npm/claude executables use ESM without relying on the host's defaults.
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
  t.after(() => {
    if (existsSync(pidFile)) {
      const pids = JSON.parse(readFileSync(pidFile, 'utf8'));
      for (const pid of [pids.child, pids.parent]) {
        try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, script, pids: () => JSON.parse(readFileSync(pidFile, 'utf8')) };
}

function isRunning(pid) {
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  // An orphan may briefly be a zombie until its reaper collects it; it cannot keep running.
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8', shell: false });
  if (state.error) throw state.error;
  return state.stdout.trim() !== '' && !state.stdout.trim().startsWith('Z');
}

async function assertStopped(pids) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && Object.values(pids).some(isRunning)) await delay(20);
  for (const [name, pid] of Object.entries(pids)) assert.equal(isRunning(pid), false, `${name} process ${pid} survived command termination`);
}

function withFixturePath(directory, callback) {
  const priorPath = process.env.PATH;
  const priorDepth = process.env.PLUGIN_RELEASE_TEST_DEPTH;
  process.env.PATH = directory;
  delete process.env.PLUGIN_RELEASE_TEST_DEPTH;
  try { return callback(); }
  finally {
    if (priorPath === undefined) delete process.env.PATH; else process.env.PATH = priorPath;
    if (priorDepth === undefined) delete process.env.PLUGIN_RELEASE_TEST_DEPTH; else process.env.PLUGIN_RELEASE_TEST_DEPTH = priorDepth;
  }
}

test('timeout terminates an opted-in POSIX process group including its child', posix, async (t) => {
  const f = fixture(t);
  const started = Date.now();
  const result = runCommand(process.execPath, [f.script], { timeout: 700, terminateGroup: true });
  assert.equal(result.error, 'ETIMEDOUT');
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.cleanupError, undefined);
  assert.ok(Date.now() - started < 4000, 'command exceeded its bounded timeout');
  await assertStopped(f.pids());
});

test('output limit terminates an opted-in POSIX process group including its child', posix, async (t) => {
  const f = fixture(t, { flood: true });
  const result = runCommand(process.execPath, [f.script], { maxBuffer: 1024, timeout: 2000, terminateGroup: true });
  assert.equal(result.error, 'ENOBUFS');
  assert.equal(result.cleanupError, undefined);
  await assertStopped(f.pids());
});

test('executeTests terminates descendants when npm exceeds the output limit', posix, async (t) => {
  const f = fixture(t, { flood: true, command: 'npm' });
  const result = withFixturePath(f.directory, () => executeTests({ name: 'fixture', relativePath: '.' }, f.directory));
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'ENOBUFS');
  assert.ok(result.stdout.length <= 16000);
  await assertStopped(f.pids());
});

test('executeNative terminates descendants when Claude exceeds the output limit', posix, async (t) => {
  const f = fixture(t, { flood: true, command: 'claude' });
  const result = withFixturePath(f.directory, () => executeNative({ name: 'fixture', hosts: ['claude'], relativePath: '.' }, f.directory));
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'ENOBUFS');
  assert.ok(result.stdout.length <= 16000);
  await assertStopped(f.pids());
});

test('command arguments remain literal without shell interpretation', () => {
  const literal = 'space ; $(printf unsafe) `printf unsafe` * "quoted"';
  const result = runCommand(process.execPath, ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', literal]);
  assert.equal(result.error, null);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), [literal]);
});
