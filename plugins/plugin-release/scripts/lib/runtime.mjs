import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

export function runCommand(command, args, { cwd, env = process.env, timeout = 60_000, maxBuffer = 2 * 1024 * 1024, terminateGroup = false } = {}) {
  const ownsProcessGroup = terminateGroup && process.platform !== 'win32';
  const result = spawnSync(command, args, {
    cwd, env, timeout, maxBuffer, detached: ownsProcessGroup,
    encoding: 'utf8', shell: false, killSignal: 'SIGKILL',
  });
  let cleanupError = null;
  // spawnSync kills only its direct child; a private POSIX group also covers descendants.
  if (ownsProcessGroup && ['ETIMEDOUT', 'ENOBUFS'].includes(result.error?.code) && Number.isInteger(result.pid) && result.pid > 0) {
    try {
      process.kill(-result.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') cleanupError = error.code ?? error.message;
    }
  }
  return {
    exitCode: result.status,
    error: result.error?.code ?? null,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(cleanupError ? { cleanupError } : {}),
  };
}

export function gitState(repo) {
  const top = runCommand('git', ['-C', repo, 'rev-parse', '--show-toplevel']);
  if (top.exitCode !== 0) return { available: false, reason: 'Not a Git working tree or Git unavailable.' };
  if (realpathSync(top.stdout.trim()) !== realpathSync(repo)) {
    throw new Error('--repo must be the source repository root, not a nested or installed plugin directory.');
  }
  const invoke = (args) => runCommand('git', ['-C', repo, ...args]);
  const status = invoke(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (status.exitCode !== 0 || status.error) throw new Error('Cannot read Git working tree status.');
  const tokens = status.stdout.split('\0');
  const changes = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const change = { status: token.slice(0, 2), path: token.slice(3) };
    if (/[RC]/.test(change.status)) change.from = tokens[++index];
    changes.push(change);
  }
  const head = invoke(['rev-parse', '--verify', 'HEAD']);
  const branch = invoke(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const upstream = invoke(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  return {
    available: true,
    head: head.exitCode === 0 ? head.stdout.trim() : null,
    branch: branch.exitCode === 0 ? branch.stdout.trim() : null,
    upstream: upstream.exitCode === 0 ? upstream.stdout.trim() : null,
    clean: changes.length === 0,
    conflicted: changes.some(({ status: code }) => /U/.test(code) || ['AA', 'DD'].includes(code)),
    changes,
    remoteVerified: false,
  };
}

export function executeTests(plugin, repo) {
  if (process.env.PLUGIN_RELEASE_TEST_DEPTH) {
    return { plugin: plugin.name, status: 'failed', reason: 'Recursive --tests invocation is not allowed.' };
  }
  const result = runCommand('npm', ['run', 'test', '--ignore-scripts'], {
    cwd: `${repo}/${plugin.relativePath}`,
    env: { ...process.env, PLUGIN_RELEASE_TEST_DEPTH: '1' },
    terminateGroup: true,
  });
  return { plugin: plugin.name, status: result.exitCode === 0 && !result.error ? 'passed' : 'failed', ...result, stdout: result.stdout.slice(-16_000), stderr: result.stderr.slice(-16_000) };
}

export function executeNative(plugin, repo) {
  if (!plugin.hosts.includes('claude')) {
    return { plugin: plugin.name, host: 'claude', status: 'not_applicable' };
  }
  const result = runCommand('claude', ['plugin', 'validate', `${repo}/${plugin.relativePath}`, '--strict'], { terminateGroup: true });
  return {
    plugin: plugin.name, host: 'claude',
    status: result.error === 'ENOENT' ? 'not_run' : result.exitCode === 0 && !result.error ? 'passed' : 'failed',
    ...result, stdout: result.stdout.slice(-16_000), stderr: result.stderr.slice(-16_000),
  };
}
