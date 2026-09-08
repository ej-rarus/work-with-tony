#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepository } from './lib/validate.mjs';
import { prepareRelease, applyRelease } from './lib/prepare.mjs';
import { gitState, executeTests, executeNative } from './lib/runtime.mjs';

const HELP = `Plugin Release — Node 20+\n\ncheck --repo PATH [--plugin NAME | --all] [--tests] [--native] [--json]\nprepare --repo PATH --plugin NAME [--version VERSION] [--write] [--json]\n\ncheck performs static validation. --tests runs each selected npm test (60s timeout).\n--native runs the installed Claude validator; its absence is reported as not run.\nprepare previews version/registration edits. --write applies exactly those edits.\nOmit --version to reconcile registration without changing plugin versions.\nGit publication is orchestrated by the release skill, not by this CLI.\n`;

export function parseArgs(argv) {
  if (argv.length === 0 || (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0]))) return { help: true };
  const [command, ...tokens] = argv;
  if (!['check', 'prepare'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const values = new Set(['--repo', '--plugin', '--version']);
  const booleans = new Set(['--all', '--tests', '--native', '--write', '--json']);
  const result = { command };
  const seen = new Set();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!values.has(token) && !booleans.has(token)) throw new Error(`Unknown argument: ${token}`);
    if (seen.has(token)) throw new Error(`Duplicate argument: ${token}`);
    seen.add(token);
    if (values.has(token)) {
      const value = tokens[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value: ${token}`);
      result[token.slice(2)] = value;
    } else result[token.slice(2)] = true;
  }
  if (!result.repo) throw new Error('--repo is required. Use the source repository, not the installed plugin cache.');
  if (result.plugin && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.plugin)) throw new Error('--plugin must be a lowercase hyphenated plugin name.');
  if (result.all && result.plugin) throw new Error('--all and --plugin are mutually exclusive.');
  if (command === 'check' && (result.version || result.write)) throw new Error('--version and --write belong to prepare.');
  if (command === 'prepare' && (!result.plugin || result.all || result.tests || result.native)) throw new Error('prepare requires one --plugin; --all, --tests and --native belong to check.');
  result.repo = resolve(result.repo);
  return result;
}

export function checkRelease(options) {
  if (options.tests && process.env.PLUGIN_RELEASE_TEST_DEPTH) throw new Error('Recursive --tests invocation is not allowed; fixture checks must omit --tests.');
  const validation = validateRepository({ repo: options.repo, plugin: options.plugin });
  gitState(validation.repo); // Reject a nested Git directory before executing any package scripts.
  const tests = [];
  const native = [];
  for (const plugin of validation.plugins) {
    if (!options.tests || !validation.ok) {
      tests.push({ plugin: plugin.name, status: 'not_run', reason: options.tests ? 'Fix static validation errors first.' : '--tests was not requested.' });
    } else {
      const packageFile = resolve(validation.repo, plugin.relativePath, 'package.json');
      const pkg = existsSync(packageFile) ? JSON.parse(readFileSync(packageFile, 'utf8')) : null;
      if (!pkg?.scripts?.test) tests.push({ plugin: plugin.name, status: 'not_run', reason: 'No npm test script declared.' });
      else tests.push(executeTests(plugin, validation.repo));
    }
    if (options.native && validation.ok) native.push(executeNative(plugin, validation.repo));
    else native.push({ plugin: plugin.name, host: 'claude', status: 'not_run', reason: options.native ? 'Fix static validation errors first.' : '--native was not requested.' });
    if (plugin.hosts.includes('codex')) native.push({ plugin: plugin.name, host: 'codex', status: 'not_run', reason: 'Built-in scoped checks only; complete official Codex schema validation is not bundled.' });
  }
  const finalValidation = options.tests || options.native
    ? validateRepository({ repo: options.repo, plugin: options.plugin }) : validation;
  const verificationIncomplete = !options.tests || tests.some((test) => test.status !== 'passed') || (options.native && native.some((item) => item.host === 'claude' && item.status === 'not_run'));
  const ok = validation.ok && finalValidation.ok && !tests.some((test) => test.status === 'failed') && !native.some((item) => item.status === 'failed');
  const git = gitState(validation.repo); // Package tests can create or modify files.
  return {
    ...finalValidation, ok, command: 'check',
    status: !ok ? 'failed' : verificationIncomplete ? 'incomplete' : 'passed',
    tests, native, git,
    published: false,
  };
}

export function renderReport(report) {
  if (report.error) return `ERROR: ${report.error}\n`;
  const lines = [`Plugin Release · ${report.command}`, `Repository: ${report.repo}`];
  if (report.command === 'prepare') {
    lines.push(`Plugin: ${report.plugin ?? '-'}`, `Mode: ${report.mode ?? 'blocked'}`);
    if (report.currentVersion) lines.push(`Version: ${report.currentVersion} → ${report.nextVersion}`);
    for (const change of report.changes) lines.push(`\n${change.path}\n--- before\n${change.before}+++ after\n${change.after}`);
    if (report.ok && !report.changes.length) lines.push('No metadata changes needed.');
  } else {
    lines.push(`Status: ${report.status}`);
    for (const plugin of report.plugins) lines.push(`Package: ${plugin.name}@${plugin.version} (${plugin.hosts.join(', ')})`);
    for (const test of report.tests) lines.push(`Tests: ${test.plugin} · ${test.status}${test.reason ? ` · ${test.reason}` : ''}`);
    for (const result of report.native) lines.push(`Native ${result.host}: ${result.plugin} · ${result.status}${result.reason ? ` · ${result.reason}` : ''}`);
  }
  for (const issue of report.issues ?? []) lines.push(`${issue.level.toUpperCase()} ${issue.code}: ${issue.message}`);
  if (report.git?.available) {
    lines.push(`Git: ${report.git.branch ?? 'detached/unborn'} · ${report.git.clean ? 'clean' : 'uncommitted changes'}`, `HEAD: ${report.git.head ?? 'no commits'}`, 'Remote publication: not checked by this command');
  } else lines.push('Git: unavailable');
  return `${lines.join('\n')}\n`;
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required.');
    options = parseArgs(argv);
    if (options.help) { process.stdout.write(HELP); return 0; }
    let report = options.command === 'check' ? checkRelease(options) : prepareRelease(options);
    if (options.write && report.ok) report = applyRelease(report);
    if (options.write && report.ok) {
      const verification = validateRepository({ repo: options.repo, plugin: options.plugin });
      report.ok = verification.ok;
      report.issues.push(...verification.issues);
    }
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderReport(report));
    for (const result of [...(report.tests ?? []), ...(report.native ?? [])]) {
      if (result.status === 'failed') process.stderr.write(`${result.plugin}: ${result.stderr || result.stdout || result.error || result.reason}\n`);
    }
    return report.ok && !(options.tests && report.tests?.some((test) => test.status !== 'passed')) && !(options.native && report.native?.some((item) => item.host === 'claude' && item.status === 'not_run')) ? 0 : 1;
  } catch (error) {
    const report = { ok: false, command: options?.command ?? null, error: error.message };
    process.stdout.write(argv.includes('--json') ? `${JSON.stringify(report)}\n` : renderReport(report));
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
