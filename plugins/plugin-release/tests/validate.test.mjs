import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateRepository, isSemver, compareSemver } from '../scripts/lib/validate.mjs';

const catalogs = { claude: '.claude-plugin/marketplace.json', codex: '.agents/plugins/marketplace.json' };
function write(repo, relative, value) {
  const file = path.join(repo, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}
function edit(repo, relative, update) {
  const value = JSON.parse(fs.readFileSync(path.join(repo, relative), 'utf8'));
  update(value);
  write(repo, relative, value);
}
function fixture(t, names = ['example'], hosts = ['claude', 'codex']) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-release-validate-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  for (const name of names) {
    const manifest = { name, version: '1.2.3', description: 'A useful plugin.', author: { name: 'Tony' } };
    const codex = { ...manifest, skills: './skills/', interface: {
      displayName: 'Example', shortDescription: 'A useful plugin.', longDescription: 'A useful plugin for testing.',
      developerName: 'Tony', category: 'Productivity', capabilities: [], defaultPrompt: ['Use the example.'],
    } };
    for (const host of hosts) write(repo, `plugins/${name}/.${host}-plugin/plugin.json`, host === 'codex' ? codex : manifest);
    write(repo, `plugins/${name}/package.json`, { name, version: '1.2.3' });
    write(repo, `plugins/${name}/skills/run/SKILL.md`, '---\nname: run\ndescription: Use this to run the example.\n---\n# Example\n');
  }
  write(repo, catalogs.claude, { name: 'test', customMetadata: { retained: true }, plugins: hosts.includes('claude') ? names.map(name => ({ name, source: `./plugins/${name}`, version: '1.2.3' })) : [] });
  write(repo, catalogs.codex, { name: 'test', plugins: hosts.includes('codex') ? names.map(name => ({ name, source: { source: 'local', path: `./plugins/${name}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' })) : [] });
  return repo;
}
const codes = result => result.issues.map(issue => issue.code);
const expectCode = (repo, code, options = {}) => {
  const result = validateRepository({ repo, ...options });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(codes(result).includes(code), `${code} absent: ${JSON.stringify(result)}`);
  return result;
};

test('accepts a dual-host fixture without mutating any files', t => {
  const repo = fixture(t);
  const before = fs.readFileSync(path.join(repo, catalogs.claude), 'utf8');
  assert.deepEqual(validateRepository({ repo }), {
    ok: true, repo, plugins: [{ name: 'example', relativePath: 'plugins/example', version: '1.2.3', hosts: ['claude', 'codex'] }], issues: [],
  });
  assert.equal(fs.readFileSync(path.join(repo, catalogs.claude), 'utf8'), before);
});

test('empty and remote-only catalogs cannot pass with no local plugins', t => {
  const repo = fixture(t, []);
  fs.mkdirSync(path.join(repo, 'plugins'));
  expectCode(repo, 'NO_LOCAL_PLUGINS');
  edit(repo, catalogs.claude, catalog => { catalog.plugins.push({ name: 'remote', source: { source: 'github', repo: 'example/remote' } }); });
  expectCode(repo, 'NO_LOCAL_PLUGINS');
});

test('accepts the existing LinkedIn and Suno manifest shapes and skill content', t => {
  const repo = fixture(t, ['linkedin-post', 'suno-music']);
  for (const name of ['linkedin-post', 'suno-music']) {
    for (const host of ['claude', 'codex']) {
      edit(repo, `plugins/${name}/.${host}-plugin/plugin.json`, manifest => {
        manifest.version = '0.1.0';
        manifest.repository = 'https://github.com/ej-rarus/work-with-tony';
        manifest.license = 'MIT';
        manifest.keywords = name === 'suno-music' ? ['suno', 'music', 'browser'] : ['linkedin', 'writing', 'publishing'];
        if (host === 'codex') {
          manifest.homepage = manifest.repository;
          manifest.interface.capabilities = name === 'suno-music' ? ['Interactive', 'Browser'] : ['Interactive', 'Write'];
          manifest.interface.category = name === 'suno-music' ? 'Creative' : 'Productivity';
          manifest.interface.defaultPrompt = [`$${name}:${name === 'suno-music' ? 'prepare' : 'post'} 내용을 준비해줘`];
        } else manifest.author.url = 'https://github.com/ej-rarus';
      });
    }
    edit(repo, catalogs.claude, catalog => { catalog.plugins.find(entry => entry.name === name).version = '0.1.0'; });
    write(repo, `plugins/${name}/package.json`, { version: '0.1.0' });
  }
  assert.equal(validateRepository({ repo }).ok, true);
});

test('a plugin only needs registration for hosts it supports', t => {
  const repo = fixture(t, ['example'], ['codex']);
  assert.deepEqual(validateRepository({ repo }).plugins[0].hosts, ['codex']);
  assert.equal(validateRepository({ repo }).ok, true);
});

test('a package is optional and its version field is optional', t => {
  const repo = fixture(t);
  fs.unlinkSync(path.join(repo, 'plugins/example/package.json'));
  assert.equal(validateRepository({ repo }).ok, true);
  write(repo, 'plugins/example/package.json', { name: 'example', private: true });
  assert.equal(validateRepository({ repo }).ok, true);
});

test('invalid JSON and non-object JSON return structured errors', t => {
  const repo = fixture(t);
  write(repo, catalogs.claude, '{');
  expectCode(repo, 'JSON_INVALID');
  write(repo, catalogs.claude, []);
  expectCode(repo, 'JSON_OBJECT_REQUIRED');
});

test('manifest name, author, description, version and interface have minimum checks', t => {
  const repo = fixture(t);
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => {
    manifest.name = 'wrong'; manifest.version = 'v1.2.3'; manifest.description = ''; manifest.author = {};
    delete manifest.interface.displayName;
  });
  const result = validateRepository({ repo });
  for (const code of ['PLUGIN_NAME_MISMATCH', 'VERSION_INVALID', 'MANIFEST_FIELD_MISSING', 'INTERFACE_FIELD_MISSING']) assert.ok(codes(result).includes(code));
});

test('version drift is detected across manifests and package', t => {
  const repo = fixture(t);
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => { manifest.version = '1.2.4'; });
  edit(repo, 'plugins/example/package.json', pkg => { pkg.version = '1.2.5'; });
  const result = expectCode(repo, 'VERSION_MISMATCH');
  assert.equal(result.issues.filter(issue => issue.code === 'VERSION_MISMATCH').length, 2);
});

test('Codex cache build versions may differ but not prerelease or base version', t => {
  const repo = fixture(t);
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => { manifest.version = '1.2.3+codex.20260908.1'; });
  assert.equal(validateRepository({ repo }).ok, true);
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => { manifest.version = '1.2.3-beta.1+codex.1'; });
  expectCode(repo, 'VERSION_MISMATCH');
});

test('Codex-only plugin reports its base version without its codex cache build', t => {
  const repo = fixture(t, ['example'], ['codex']);
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => { manifest.version = '1.2.3+codex.1'; });
  const result = validateRepository({ repo });
  assert.equal(result.ok, true);
  assert.equal(result.plugins[0].version, '1.2.3');
});

test('missing registrations and stale Claude catalog versions have reconciliation codes', t => {
  const repo = fixture(t);
  edit(repo, catalogs.claude, catalog => { catalog.plugins[0].version = '1.0.0'; });
  edit(repo, catalogs.codex, catalog => { catalog.plugins = []; });
  const result = validateRepository({ repo });
  assert.deepEqual(codes(result).sort(), ['MARKETPLACE_ENTRY_MISSING', 'MARKETPLACE_VERSION_MISMATCH']);
});

test('Claude catalog version may be omitted and Codex needs no entry version', t => {
  const repo = fixture(t);
  edit(repo, catalogs.claude, catalog => { delete catalog.plugins[0].version; });
  assert.equal(validateRepository({ repo }).ok, true);
});

test('duplicate catalog names and sources are rejected', t => {
  const repo = fixture(t);
  edit(repo, catalogs.claude, catalog => { catalog.plugins.push({ ...catalog.plugins[0] }); });
  const result = expectCode(repo, 'MARKETPLACE_DUPLICATE');
  assert.ok(codes(result).includes('MARKETPLACE_DUPLICATE_SOURCE'));
});

test('dangling sources and mismatched names cannot count as registrations', t => {
  const repo = fixture(t, ['example', 'other']);
  edit(repo, catalogs.claude, catalog => {
    catalog.plugins[0].source = './plugins/other';
    catalog.plugins.push({ name: 'ghost', source: './plugins/ghost' });
  });
  const result = expectCode(repo, 'MARKETPLACE_SOURCE_MISMATCH');
  assert.ok(codes(result).includes('PATH_MISSING'));
  assert.ok(codes(result).includes('MARKETPLACE_ENTRY_MISSING'));
});

test('registration for an unsupported host is rejected', t => {
  const repo = fixture(t, ['example'], ['codex']);
  edit(repo, catalogs.claude, catalog => { catalog.plugins.push({ name: 'example', source: './plugins/example' }); });
  expectCode(repo, 'MARKETPLACE_HOST_MANIFEST_MISSING');
});

test('Codex source shape, policy enums and category are checked', t => {
  const repo = fixture(t);
  edit(repo, catalogs.codex, catalog => { catalog.plugins[0].source = './plugins/example'; });
  expectCode(repo, 'MARKETPLACE_SOURCE_INVALID');
  edit(repo, catalogs.codex, catalog => {
    catalog.plugins[0].source = { source: 'local', path: './plugins/example' };
    catalog.plugins[0].policy = { installation: 'YES', authentication: 'NEVER' };
    catalog.plugins[0].category = '';
  });
  const result = expectCode(repo, 'MARKETPLACE_POLICY_INVALID');
  assert.ok(codes(result).includes('MARKETPLACE_CATEGORY_INVALID'));
});

test('unknown marketplace metadata and categories are preserved by read-only validation', t => {
  const repo = fixture(t);
  edit(repo, catalogs.codex, catalog => { catalog.plugins[0].category = 'Developer Tools'; catalog.plugins[0].futureMetadata = { rank: 4 }; });
  assert.equal(validateRepository({ repo }).ok, true);
});

test('external git entries are warnings without network access or false local registration', t => {
  const repo = fixture(t);
  edit(repo, catalogs.claude, catalog => { catalog.plugins.push({ name: 'external', source: { source: 'github', repo: 'example/external' } }); });
  const result = validateRepository({ repo });
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues.map(({ code, level }) => ({ code, level })), [{ code: 'EXTERNAL_SOURCE_UNCHECKED', level: 'warning' }]);
});

test('selectors validate only the chosen plugin contents and registration', t => {
  const repo = fixture(t, ['example', 'other']);
  edit(repo, 'plugins/other/.codex-plugin/plugin.json', manifest => { manifest.description = ''; });
  edit(repo, catalogs.claude, catalog => { catalog.plugins = catalog.plugins.filter(entry => entry.name !== 'other'); });
  const selected = validateRepository({ repo, plugin: 'example' });
  assert.equal(selected.ok, true);
  assert.deepEqual(selected.plugins.map(item => item.name), ['example']);
  assert.equal(validateRepository({ repo }).ok, false);
  expectCode(repo, 'PLUGIN_NOT_FOUND', { plugin: 'missing' });
  expectCode(repo, 'PLUGIN_SELECTOR_INVALID', { plugin: '../example' });
  assert.equal(validateRepository({ repo: '.' }).issues[0].code, 'REPO_PATH_INVALID');
});

test('source traversal and absolute source paths are rejected before reading them', t => {
  const repo = fixture(t);
  for (const source of ['./plugins/../plugins/example', '../outside', '/tmp/example', 'plugins\\example']) {
    edit(repo, catalogs.claude, catalog => { catalog.plugins[0].source = source; });
    expectCode(repo, 'PATH_REFERENCE_INVALID');
  }
});

test('symlinked repository components, plugin manifests, assets and skill directories are rejected', t => {
  for (const relative of ['plugins/example/.claude-plugin/plugin.json', 'plugins/example/skills/run', '.agents/plugins/marketplace.json']) {
    const repo = fixture(t);
    const original = path.join(repo, relative), moved = `${original}.original`;
    fs.renameSync(original, moved);
    fs.symlinkSync(moved, original);
    expectCode(repo, 'PATH_SYMLINK');
  }
  const repo = fixture(t);
  fs.renameSync(path.join(repo, 'plugins'), path.join(repo, 'real-plugins'));
  fs.symlinkSync(path.join(repo, 'real-plugins'), path.join(repo, 'plugins'));
  expectCode(repo, 'PATH_SYMLINK');
});

test('missing skills and empty skill collections are rejected', t => {
  const repo = fixture(t);
  fs.unlinkSync(path.join(repo, 'plugins/example/skills/run/SKILL.md'));
  expectCode(repo, 'SKILL_FILE_MISSING');
  fs.rmdirSync(path.join(repo, 'plugins/example/skills/run'));
  expectCode(repo, 'SKILLS_EMPTY');
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => { manifest.skills = './missing-skills'; });
  expectCode(repo, 'PATH_MISSING');
});

test('skill frontmatter accepts quoted and folded text and rejects absent fields', t => {
  const repo = fixture(t);
  write(repo, 'plugins/example/skills/run/SKILL.md', '---\nname: "run"\ndescription: >-\n  An example\n  across lines.\n---\n# Example\n');
  assert.equal(validateRepository({ repo }).ok, true);
  write(repo, 'plugins/example/skills/run/SKILL.md', '---\nname: run\ndescription: ""\n---\n# Example\n');
  expectCode(repo, 'SKILL_FRONTMATTER_INVALID');
  write(repo, 'plugins/example/skills/run/SKILL.md', '# Example\n');
  expectCode(repo, 'SKILL_FRONTMATTER_INVALID');
});

test('referenced assets and companion configs must exist and stay inside the plugin', t => {
  const repo = fixture(t);
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => {
    manifest.interface.logo = './assets/missing.png';
    manifest.interface.screenshots = ['./assets/missing-shot.png'];
    manifest.apps = './missing-app.json'; manifest.mcpServers = './missing-mcp.json';
  });
  const missing = expectCode(repo, 'PATH_MISSING');
  assert.ok(missing.issues.filter(issue => issue.code === 'PATH_MISSING').length >= 4);
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => { manifest.interface.logo = '../other/private.png'; });
  expectCode(repo, 'PATH_REFERENCE_INVALID');
});

test('nested interface screenshot/logo fields and symlinked assets are inspected', t => {
  const repo = fixture(t);
  write(repo, 'plugins/example/assets/icon.png', 'png fixture');
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => {
    manifest.interface.variant = { logo: './assets/icon.png', screenshots: ['./assets/icon.png'] };
  });
  assert.equal(validateRepository({ repo }).ok, true);
  fs.symlinkSync(path.join(repo, 'plugins/example/assets/icon.png'), path.join(repo, 'plugins/example/assets/link.png'));
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => { manifest.interface.variant.logo = './assets/link.png'; });
  expectCode(repo, 'PATH_SYMLINK');
});

test('MCP companion JSON and explicit local executable arguments are checked statically', t => {
  const repo = fixture(t);
  edit(repo, 'plugins/example/.codex-plugin/plugin.json', manifest => { manifest.mcpServers = './.mcp.json'; });
  write(repo, 'plugins/example/.mcp.json', { mcpServers: { local: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/server.mjs'] } } });
  expectCode(repo, 'PATH_MISSING');
  write(repo, 'plugins/example/scripts/server.mjs', 'process.exit(99); // Must never run during static validation.\n');
  assert.equal(validateRepository({ repo }).ok, true);
  write(repo, 'plugins/example/.mcp.json', '{');
  expectCode(repo, 'JSON_INVALID');
});

test('strict semver syntax rejects prefixes, padding, incomplete and malformed versions', () => {
  for (const version of ['0.0.0', '1.2.3', '1.2.3-alpha.1', '1.2.3-0', '1.2.3+codex.01', '1.2.3-rc.1+build.5']) assert.equal(isSemver(version), true, version);
  for (const version of ['', 'v1.2.3', '01.2.3', '1.2', '1.2.3-01', '1.2.3-', '1.2.3+', '1.2.3 alpha', null, 123]) assert.equal(isSemver(version), false, String(version));
});

test('semver comparison obeys prerelease precedence, ignores builds and handles large integers', () => {
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  for (let index = 1; index < ordered.length; index += 1) {
    assert.equal(compareSemver(ordered[index - 1], ordered[index]), -1);
    assert.equal(compareSemver(ordered[index], ordered[index - 1]), 1);
  }
  assert.equal(compareSemver('1.2.3+foo', '1.2.3+bar'), 0);
  assert.equal(compareSemver('9007199254740992.0.0', '9007199254740993.0.0'), -1);
  assert.throws(() => compareSemver('1.0', '1.0.0'), TypeError);
});
