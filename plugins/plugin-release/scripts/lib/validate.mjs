import fs from 'node:fs';
import path from 'node:path';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTS = [
  { name: 'claude', manifest: '.claude-plugin/plugin.json', marketplace: '.claude-plugin/marketplace.json' },
  { name: 'codex', manifest: '.codex-plugin/plugin.json', marketplace: '.agents/plugins/marketplace.json' },
];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const inside = (base, target) => target === base || target.startsWith(`${base}${path.sep}`);
const withoutCodexBuild = version => typeof version === 'string' ? version.replace(/\+codex\.[0-9A-Za-z.-]+$/, '') : version;

export function isSemver(value) {
  return typeof value === 'string' && SEMVER.test(value);
}

/** SemVer precedence; build metadata is intentionally ignored. Invalid input throws. */
export function compareSemver(a, b) {
  if (!isSemver(a) || !isSemver(b)) throw new TypeError('compareSemver requires two strict semantic versions');
  const left = a.match(SEMVER), right = b.match(SEMVER);
  for (let index = 1; index <= 3; index += 1) {
    const x = BigInt(left[index]), y = BigInt(right[index]);
    if (x !== y) return x < y ? -1 : 1;
  }
  if (left[4] === right[4]) return 0;
  if (!left[4]) return 1;
  if (!right[4]) return -1;
  const x = left[4].split('.'), y = right[4].split('.');
  for (let index = 0; index < Math.max(x.length, y.length); index += 1) {
    if (x[index] === undefined) return -1;
    if (y[index] === undefined) return 1;
    if (x[index] === y[index]) continue;
    const nx = /^\d+$/.test(x[index]), ny = /^\d+$/.test(y[index]);
    if (nx && ny) return BigInt(x[index]) < BigInt(y[index]) ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x[index] < y[index] ? -1 : 1;
  }
  return 0;
}

/**
 * Read-only, repository-local preflight, not a substitute for a host's native validator.
 * Symlinks anywhere beneath the repository in paths we inspect are rejected, even
 * if they resolve inside it. External catalog sources are reported but not fetched.
 */
export function validateRepository({ repo, plugin } = {}) {
  const issues = [], plugins = [];
  const add = (code, message, name, level = 'error') => issues.push({ code, level, message, ...(name ? { plugin: name } : {}) });
  const resolved = typeof repo === 'string' && repo ? path.resolve(repo) : null;
  const finish = () => ({ ok: !issues.some(issue => issue.level === 'error'), repo: resolved, plugins, issues });
  if (!nonempty(repo) || !path.isAbsolute(repo)) {
    add('REPO_PATH_INVALID', 'repo must be an explicit absolute directory path');
    return finish();
  }
  if (plugin !== undefined && (!nonempty(plugin) || !SLUG.test(plugin))) {
    add('PLUGIN_SELECTOR_INVALID', 'plugin must be a kebab-case folder name');
    return finish();
  }

  // This function performs the boundary check before every filesystem read.
  function inspect(target, { name, required = true, kind, label = path.relative(resolved, target), missingCode = 'PATH_MISSING' } = {}) {
    if (!inside(resolved, target)) {
      add('PATH_OUTSIDE_REPO', `${label} is outside the repository`, name);
      return null;
    }
    let cursor = resolved;
    const segments = path.relative(resolved, target).split(path.sep).filter(Boolean);
    for (let index = -1; index < segments.length; index += 1) {
      if (index >= 0) cursor = path.join(cursor, segments[index]);
      let stat;
      try { stat = fs.lstatSync(cursor); }
      catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
          if (required) add(missingCode, `${label || 'repository'} does not exist`, name);
        } else add('PATH_UNREADABLE', `${label || 'repository'} cannot be inspected: ${error.code}`, name);
        return null;
      }
      if (stat.isSymbolicLink()) {
        add('PATH_SYMLINK', `${label || 'repository'} contains a symlink; repository-local paths must be regular files/directories`, name);
        return null;
      }
      if (index < segments.length - 1 && !stat.isDirectory()) {
        if (required) add('PATH_TYPE_INVALID', `${label} has a non-directory parent`, name);
        return null;
      }
      if (index === segments.length - 1) {
        if ((kind === 'directory' && !stat.isDirectory()) || (kind === 'file' && !stat.isFile())) {
          add('PATH_TYPE_INVALID', `${label || 'repository'} must be a ${kind}`, name);
          return null;
        }
        return stat;
      }
    }
    return null;
  }

  function readJson(file, name, options = {}) {
    if (!inspect(file, { name, kind: 'file', ...options })) return null;
    try {
      const result = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!object(result)) {
        add('JSON_OBJECT_REQUIRED', `${path.relative(resolved, file)} must contain a JSON object`, name);
        return null;
      }
      return result;
    } catch (error) {
      add(error instanceof SyntaxError ? 'JSON_INVALID' : 'PATH_UNREADABLE', `${path.relative(resolved, file)} cannot be read as JSON`, name);
      return null;
    }
  }

  function children(directory, name) {
    if (!inspect(directory, { name, kind: 'directory' })) return [];
    try { return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
    catch (error) { add('PATH_UNREADABLE', `${path.relative(resolved, directory)} cannot be listed: ${error.code}`, name); return []; }
  }

  function localReference(base, raw, label, name, kind = 'file') {
    if (!nonempty(raw) || path.isAbsolute(raw) || raw.includes('\\') || raw.includes('\0') || raw.split('/').includes('..') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) {
      add('PATH_REFERENCE_INVALID', `${label} must be a relative path without traversal`, name);
      return null;
    }
    const target = path.resolve(base, raw);
    if (!inside(base, target)) {
      add('PATH_OUTSIDE_PLUGIN', `${label} leaves its plugin directory`, name);
      return null;
    }
    return inspect(target, { name, kind, label }) ? target : null;
  }

  function checkAssets(value, root, name, prefix) {
    if (!object(value) && !Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const label = `${prefix}.${key}`;
      if (['logo', 'logoDark', 'composerIcon', 'icon_small', 'icon_large'].includes(key)) {
        localReference(root, child, label, name);
      } else if (key === 'screenshots') {
        if (!Array.isArray(child)) add('ASSET_LIST_INVALID', `${label} must be an array of local file paths`, name);
        else child.forEach((asset, index) => localReference(root, asset, `${label}[${index}]`, name));
      } else checkAssets(child, root, name, label);
    }
  }

  function checkMcp(value, root, name, label) {
    if (!object(value)) { add('MCP_CONFIG_INVALID', `${label} must be an object`, name); return; }
    for (const [server, config] of Object.entries(value)) {
      if (!object(config)) { add('MCP_CONFIG_INVALID', `${label}.${server} must be an object`, name); continue; }
      for (const item of [config.command, ...(Array.isArray(config.args) ? config.args : [])]) {
        if (typeof item !== 'string') continue;
        const normalized = item.replace(/^\$\{(?:CLAUDE_PLUGIN_ROOT|CODEX_PLUGIN_ROOT)\}\//, './');
        if (/^(?:\.\.?\/|\$\{(?:CLAUDE_PLUGIN_ROOT|CODEX_PLUGIN_ROOT)\})/.test(normalized)) {
          localReference(root, normalized, `${label}.${server} local command/argument`, name);
        }
      }
    }
  }

  const checkedSkills = new Set();
  function checkSkillFile(file, name) {
    if (checkedSkills.has(file)) return;
    checkedSkills.add(file);
    if (!inspect(file, { name, kind: 'file', missingCode: 'SKILL_FILE_MISSING' })) return;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch { add('PATH_UNREADABLE', `${path.relative(resolved, file)} cannot be read`, name); return; }
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    if (frontmatter === undefined) { add('SKILL_FRONTMATTER_INVALID', `${path.relative(resolved, file)} needs closed YAML frontmatter`, name); return; }
    for (const field of ['name', 'description']) {
      const match = frontmatter.match(new RegExp(`^${field}:[ \\t]*(.*)$`, 'm'));
      let value = match?.[1]?.trim();
      let quoted = false;
      if (value && /^[>|][+-]?$/.test(value)) {
        value = frontmatter.slice(match.index + match[0].length).match(/^\r?\n((?:[ \t]+[^\r\n]+\r?\n?)+)/)?.[1]?.trim();
        quoted = true;
      } else if (value && /^['"]/.test(value)) {
        if (/^(['"]).*\1$/.test(value)) { value = value.slice(1, -1).trim(); quoted = true; }
        else value = undefined;
      }
      if (!value || (!quoted && /^(?:#|\[|\{|null$|~$|true$|false$|\d+$)/i.test(value))) {
        add('SKILL_FRONTMATTER_INVALID', `${path.relative(resolved, file)} needs a nonempty ${field} string`, name);
      }
    }
  }

  function checkSkills(root, raw, name) {
    const target = localReference(root, raw, `${name}.skills`, name, null);
    if (!target) return;
    const stat = inspect(target, { name });
    if (!stat) return;
    if (stat.isFile()) { checkSkillFile(target, name); return; }
    if (!stat.isDirectory()) { add('PATH_TYPE_INVALID', `${name}.skills must be a file or directory`, name); return; }
    if (inspect(path.join(target, 'SKILL.md'), { name, required: false, kind: 'file' })) { checkSkillFile(path.join(target, 'SKILL.md'), name); return; }
    const entries = children(target, name).filter(entry => !entry.name.startsWith('.'));
    let count = 0;
    for (const entry of entries) {
      const dir = path.join(target, entry.name);
      if (entry.isSymbolicLink()) { inspect(dir, { name }); continue; }
      if (entry.isDirectory()) { count += 1; checkSkillFile(path.join(dir, 'SKILL.md'), name); }
    }
    if (!count) add('SKILLS_EMPTY', `${name}.skills contains no skill directories with SKILL.md`, name);
  }

  const pluginRoot = path.join(resolved, 'plugins');
  if (!inspect(resolved, { kind: 'directory' }) || !inspect(pluginRoot, { kind: 'directory' })) return finish();
  const entries = children(pluginRoot);
  const names = entries.filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(entry => entry.name);
  if (!names.length) add('NO_LOCAL_PLUGINS', 'No local plugins were found under plugins/. External catalog entries are not locally validated.');
  if (plugin && !names.includes(plugin)) add('PLUGIN_NOT_FOUND', `plugins/${plugin} does not exist`, plugin);
  const manifestsByName = new Map();
  for (const name of names.filter(name => !plugin || name === plugin)) {
    const root = path.join(pluginRoot, name);
    if (!inspect(root, { name, kind: 'directory' })) continue;
    if (!SLUG.test(name)) add('PLUGIN_NAME_INVALID', `${name} must be a kebab-case plugin folder name`, name);
    const manifests = new Map();
    for (const host of HOSTS) {
      const file = path.join(root, host.manifest);
      if (!inspect(file, { name, required: false, kind: 'file' })) continue;
      const manifest = readJson(file, name);
      if (!manifest) continue;
      manifests.set(host.name, manifest);
      if (manifest.name !== name) add('PLUGIN_NAME_MISMATCH', `${host.name} manifest name must equal folder ${name}`, name);
      if (!isSemver(manifest.version)) add('VERSION_INVALID', `${host.name} manifest version must be strict semver`, name);
      if (!nonempty(manifest.description)) add('MANIFEST_FIELD_MISSING', `${host.name} manifest description is required`, name);
      if (!object(manifest.author) || !nonempty(manifest.author.name)) add('MANIFEST_FIELD_MISSING', `${host.name} manifest author.name is required`, name);
      if (host.name === 'codex') {
        const ui = manifest.interface;
        for (const field of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
          if (!object(ui) || !nonempty(ui[field])) add('INTERFACE_FIELD_MISSING', `codex interface.${field} is required`, name);
        }
        if (!object(ui) || !Array.isArray(ui.capabilities) || !ui.capabilities.every(nonempty)) add('INTERFACE_FIELD_INVALID', 'codex interface.capabilities must be an array of nonempty strings', name);
        const prompt = ui?.defaultPrompt ?? ui?.default_prompt;
        if (!nonempty(prompt) && !(Array.isArray(prompt) && prompt.length && prompt.every(nonempty))) add('INTERFACE_FIELD_INVALID', 'codex interface.defaultPrompt must contain a prompt string or a nonempty string array', name);
      }
      const defaultSkills = path.join(root, 'skills');
      if (manifest.skills !== undefined) {
        for (const skill of Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills]) checkSkills(root, skill, name);
      } else if (inspect(defaultSkills, { name, required: false, kind: 'directory' })) checkSkills(root, './skills', name);
      // Defaults are additive to an explicitly configured skill location.
      if (manifest.skills !== undefined && manifest.skills !== './skills' && manifest.skills !== './skills/' && inspect(defaultSkills, { name, required: false, kind: 'directory' })) checkSkills(root, './skills', name);
      for (const field of ['apps', 'mcpServers', 'hooks']) {
        const value = manifest[field];
        if (value === undefined) continue;
        if (typeof value === 'string') {
          const companion = localReference(root, value, `${host.name}.${field}`, name);
          if (companion) {
            const payload = readJson(companion, name);
            if (payload) { checkAssets(payload, root, name, field); if (field === 'mcpServers') checkMcp(payload.mcpServers, root, name, field); }
          }
        } else if (object(value) && field !== 'apps') {
          if (field === 'mcpServers') checkMcp(value, root, name, `${host.name}.${field}`);
          checkAssets(value, root, name, field);
        } else add('MANIFEST_FIELD_INVALID', `${host.name}.${field} must be a local config path${field !== 'apps' ? ' or object' : ''}`, name);
      }
      checkAssets(manifest.interface, root, name, `${host.name}.interface`);
    }
    if (!manifests.size) add('PLUGIN_MANIFEST_MISSING', `plugins/${name} needs a Claude or Codex plugin.json manifest`, name);
    const claude = manifests.get('claude'), codex = manifests.get('codex');
    const version = claude?.version ?? withoutCodexBuild(codex?.version) ?? null;
    if (claude && codex && codex.version !== claude.version && withoutCodexBuild(codex.version) !== claude.version) add('VERSION_MISMATCH', 'Claude and Codex manifest versions must match (Codex +codex build metadata is allowed)', name);
    const packagePath = path.join(root, 'package.json');
    if (inspect(packagePath, { name, required: false, kind: 'file' })) {
      const pkg = readJson(packagePath, name);
      if (pkg?.version !== undefined && (!isSemver(pkg.version) || pkg.version !== version)) add('VERSION_MISMATCH', `package.json version must match the base manifest version ${version}`, name);
    }
    plugins.push({ name, relativePath: `plugins/${name}`, version, hosts: [...manifests.keys()] });
    manifestsByName.set(name, manifests);
  }

  for (const host of HOSTS) {
    const marketplace = readJson(path.join(resolved, host.marketplace));
    if (!marketplace) continue;
    if (!nonempty(marketplace.name)) add('MARKETPLACE_INVALID', `${host.marketplace} needs a name`);
    if (!Array.isArray(marketplace.plugins)) { add('MARKETPLACE_INVALID', `${host.marketplace}.plugins must be an array`); continue; }
    const seenNames = new Set(), seenPaths = new Set(), registered = new Set();
    for (const entry of marketplace.plugins) {
      if (!object(entry) || !nonempty(entry.name)) { add('MARKETPLACE_ENTRY_INVALID', `${host.marketplace} entries need a name`); continue; }
      const name = entry.name;
      if (seenNames.has(name)) add('MARKETPLACE_DUPLICATE', `${host.name} marketplace has duplicate name ${name}`, name);
      seenNames.add(name);
      let raw;
      if (host.name === 'claude' && typeof entry.source === 'string') raw = entry.source;
      else if (object(entry.source)) {
        if (entry.source.source === 'local') raw = entry.source.path;
        else if (['github', 'git', 'url', 'npm', 'pip'].includes(entry.source.source)) {
          add('EXTERNAL_SOURCE_UNCHECKED', `${host.name} marketplace source for ${name} is external and was not fetched`, name, 'warning');
          continue;
        } else { add('MARKETPLACE_SOURCE_INVALID', `${host.name} marketplace source for ${name} is unsupported`, name); continue; }
      } else { add('MARKETPLACE_SOURCE_INVALID', `${host.name} marketplace source for ${name} has the wrong shape`, name); continue; }
      if (host.name === 'codex') {
        if (!object(entry.policy) || !['NOT_AVAILABLE', 'AVAILABLE', 'INSTALLED_BY_DEFAULT'].includes(entry.policy.installation)) add('MARKETPLACE_POLICY_INVALID', `${name} installation policy is invalid`, name);
        if (!object(entry.policy) || !['ON_INSTALL', 'ON_USE'].includes(entry.policy.authentication)) add('MARKETPLACE_POLICY_INVALID', `${name} authentication policy is invalid`, name);
        if (!nonempty(entry.category)) add('MARKETPLACE_CATEGORY_INVALID', `${name} category must be a nonempty string`, name);
      }
      if (!SLUG.test(name)) { add('MARKETPLACE_ENTRY_INVALID', `${host.name} marketplace name ${name} must be kebab-case`, name); continue; }
      const target = localReference(resolved, raw, `${host.name} marketplace source for ${name}`, name, 'directory');
      if (!target) continue;
      if (seenPaths.has(target)) add('MARKETPLACE_DUPLICATE_SOURCE', `${host.name} marketplace has duplicate local source ${raw}`, name);
      seenPaths.add(target);
      if (target !== path.join(pluginRoot, name)) { add('MARKETPLACE_SOURCE_MISMATCH', `${host.name} source for ${name} must be ./plugins/${name}`, name); continue; }
      if (!inspect(path.join(target, host.manifest), { name, kind: 'file', missingCode: 'MARKETPLACE_HOST_MANIFEST_MISSING' })) continue;
      registered.add(name);
      const manifest = manifestsByName.get(name)?.get(host.name);
      if (manifest && host.name === 'claude' && entry.version !== undefined && entry.version !== manifest.version) add('MARKETPLACE_VERSION_MISMATCH', `Claude marketplace version for ${name} must match ${manifest.version}`, name);
    }
    for (const [name, manifests] of manifestsByName) {
      if (manifests.has(host.name) && !registered.has(name)) add('MARKETPLACE_ENTRY_MISSING', `${host.name} marketplace is missing ./plugins/${name}`, name);
    }
  }
  return finish();
}
