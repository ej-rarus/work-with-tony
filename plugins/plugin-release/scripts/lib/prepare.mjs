import { readFileSync, realpathSync, lstatSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, relative, sep, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateRepository, isSemver, compareSemver } from './validate.mjs';
import { gitState } from './runtime.mjs';

function localFile(repo, file) {
  const target = resolve(repo, file);
  const inside = relative(repo, target);
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`)) throw new Error(`Path outside repository: ${file}`);
  let cursor = repo;
  for (const part of inside.split(sep)) {
    cursor = resolve(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink is not supported for release metadata: ${file}`);
  }
  return target;
}

export function prepareRelease({ repo, plugin, version }) {
  if (typeof plugin !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plugin)) throw new Error('prepare requires one valid plugin name.');
  const validation = validateRepository({ repo, plugin });
  const recoverable = new Set(['MARKETPLACE_ENTRY_MISSING', 'MARKETPLACE_VERSION_MISMATCH']);
  const errors = validation.issues.filter((item) => item.level === 'error' && !recoverable.has(item.code));
  if (errors.length || validation.plugins.length !== 1) {
    return { ok: false, command: 'prepare', repo: validation.repo, issues: errors.length ? errors : validation.issues, changes: [] };
  }
  const root = realpathSync(validation.repo);
  const selected = validation.plugins[0];
  const current = selected.version.split('+')[0];
  if (version !== undefined && (!isSemver(version) || compareSemver(version, current) <= 0)) {
    return { ok: false, command: 'prepare', repo: root, issues: [{ code: 'INVALID_NEXT_VERSION', level: 'error', message: `Version must be valid SemVer greater than ${current}.` }], changes: [] };
  }
  const next = version ?? current;
  const snapshots = new Map();
  const json = (file) => {
    const absolute = localFile(root, file);
    const before = readFileSync(absolute, 'utf8');
    const value = JSON.parse(before);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`JSON object required: ${file}`);
    snapshots.set(file, { before, after: before, mode: lstatSync(absolute).mode & 0o777 });
    return value;
  };
  const update = (file, value) => {
    const snapshot = snapshots.get(file);
    // Keep files byte-identical when the parsed content has not changed.
    if (JSON.stringify(JSON.parse(snapshot.before)) !== JSON.stringify(value)) {
      snapshot.after = `${JSON.stringify(value, null, 2)}\n`;
    }
  };
  const manifests = {};
  for (const host of selected.hosts) {
    const file = `plugins/${plugin}/.${host}-plugin/plugin.json`;
    const value = json(file);
    if (version !== undefined) value.version = next;
    manifests[host] = value;
    update(file, value);
  }
  const packagePath = `plugins/${plugin}/package.json`;
  if (existsSync(resolve(root, packagePath))) {
    const pkg = json(packagePath);
    if (version !== undefined && Object.hasOwn(pkg, 'version')) pkg.version = next;
    update(packagePath, pkg);
  }
  for (const host of selected.hosts) {
    const file = host === 'claude' ? '.claude-plugin/marketplace.json' : '.agents/plugins/marketplace.json';
    const market = json(file);
    const manifest = manifests[host];
    let entry = market.plugins.find((item) => item.name === plugin);
    if (entry) {
      const source = typeof entry.source === 'string' && host === 'claude'
        ? entry.source : entry.source?.source === 'local' ? entry.source.path : null;
      if (typeof source !== 'string' || resolve(root, source) !== resolve(root, selected.relativePath)) {
        return {
          ok: false, command: 'prepare', repo: root, plugin, changes: [],
          issues: [{ code: 'MARKETPLACE_SOURCE_CONFLICT', level: 'error', plugin,
            message: `${host} already registers ${plugin} from a different source. Resolve that collision explicitly before preparing this local plugin.` }],
        };
      }
    }
    if (!entry) {
      entry = host === 'claude'
        ? { name: plugin, description: manifest.description, version: manifest.version, source: `./plugins/${plugin}`, author: manifest.author }
        : { name: plugin, source: { source: 'local', path: `./plugins/${plugin}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: manifest.interface.category };
      market.plugins.push(entry);
    } else if (host === 'claude') {
      entry.version = manifest.version;
    }
    update(file, market);
  }
  const git = gitState(root);
  if (git.conflicted) throw new Error('Resolve Git merge conflicts before preparing release metadata.');
  const changes = [...snapshots].filter(([, value]) => value.before !== value.after).map(([file, value]) => ({ path: file, ...value }));
  const staged = (git.changes ?? []).filter((item) => item.status[0] !== ' ' && item.status !== '??' && changes.some((change) => change.path === item.path || change.path === item.from));
  if (staged.length) throw new Error(`Release metadata already staged: ${staged.map((item) => item.path).join(', ')}. Commit or unstage these files deliberately first.`);
  return {
    ok: true, command: 'prepare', repo: root, plugin, currentVersion: current, nextVersion: next,
    mode: 'preview', issues: validation.issues.filter((item) => item.level !== 'error'), changes, git,
  };
}

export function applyRelease(plan) {
  if (!plan.ok || plan.mode !== 'preview') throw new Error('A successful preview is required before writing.');
  const root = realpathSync(plan.repo);
  const git = gitState(root);
  if (git.conflicted) throw new Error('Git conflicts appeared after preview.');
  const replacements = plan.changes.map((change) => {
    const target = localFile(root, change.path);
    if (readFileSync(target, 'utf8') !== change.before) throw new Error(`File changed after preview: ${change.path}`);
    if ((git.changes ?? []).some((item) => item.status[0] !== ' ' && item.status !== '??' && [item.path, item.from].includes(change.path))) throw new Error(`File staged after preview: ${change.path}`);
    return { ...change, target, temp: resolve(dirname(target), `.plugin-release-${randomUUID()}.tmp`) };
  });
  const written = [];
  try {
    for (const change of replacements) writeFileSync(change.temp, change.after, { flag: 'wx', mode: change.mode });
    for (const change of replacements) {
      // Detect changes between temporary-file creation and replacement as well.
      localFile(root, change.path);
      if (readFileSync(change.target, 'utf8') !== change.before) throw new Error(`File changed while applying: ${change.path}`);
      renameSync(change.temp, change.target);
      written.push(change);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const change of written.reverse()) {
      try {
        // Do not overwrite a concurrent edit when rolling back a failed batch.
        if (readFileSync(change.target, 'utf8') !== change.after) throw new Error('concurrent edit');
        writeFileSync(change.temp, change.before, { flag: 'wx', mode: change.mode });
        renameSync(change.temp, change.target);
      } catch (rollback) { rollbackErrors.push(`${change.path}: ${rollback.message}`); }
    }
    if (rollbackErrors.length) throw new Error(`${error.message}; manual recovery needed: ${rollbackErrors.join('; ')}`);
    throw error;
  } finally {
    for (const change of replacements) if (existsSync(change.temp)) unlinkSync(change.temp);
  }
  return { ...plan, mode: 'written', git: gitState(root) };
}
