# Suno Music Web Prepare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Codex marketplace plugin that fills Suno's Advanced creation form with user-approved title, lyrics, style, and optional settings, verifies the populated values, and always stops before `Create song`.

**Architecture:** `suno-music` is a skill-only Codex plugin. Its `prepare` skill uses Codex's existing browser control against the user's logged-in `https://suno.com/create` session; there is no MCP server, API key, private endpoint, or standalone browser process. Package tests enforce marketplace metadata, form-field semantics, and the no-credit-spend boundary.

**Tech Stack:** Codex plugin manifest, Markdown skill instructions, Node.js 20 built-in test runner, Codex browser control, repository-local Codex marketplace.

**Spec:** `docs/superpowers/specs/2026-09-05-suno-music-design.md`

## Global Constraints

- Plugin id: `suno-music`; version: `0.1.0`; skill id: `prepare`.
- Codex only for version `0.1.0`; do not add a Claude Code manifest or Claude marketplace entry.
- Use the user's existing Suno browser session; never store API keys, cookies, session tokens, or account identifiers.
- Accept `lyrics` up to 5,000 characters and `style` up to 1,000 characters; preserve user text exactly unless they ask for editing.
- Never click, press, or otherwise invoke `Create song`.
- Never automate login, CAPTCHA, payments, subscriptions, credit purchases, audio uploads, Voice, Inspo, Saved lyrics, downloads, publishing, or distribution.
- Detect form controls from fresh browser state and semantic labels; never guess with stale indexes or fixed coordinates.
- If the form already contains title, lyrics, style, or option values, ask immediately before replacing them.
- Install from the repository marketplace and push the completed commits directly to the user-approved `origin/main`.

---

### Task 1: Scaffold the Codex package and repository marketplace

**Files:**
- Create: `plugins/suno-music/.codex-plugin/plugin.json`
- Create: `plugins/suno-music/package.json`
- Create: `plugins/suno-music/tests/helpers.mjs`
- Create: `plugins/suno-music/tests/package.test.mjs`
- Create: `.agents/plugins/marketplace.json`

**Interfaces:**
- Produces plugin identity `suno-music@0.1.0`, skill discovery path `./skills/`, and marketplace name `work-with-tony`.
- Produces `readJson(relativePath, base?)`, `readText(relativePath, base?)`, `pluginRoot`, and `repoRoot` test helpers for Task 2.

- [ ] **Step 1: Scaffold the plugin and marketplace with the supported helper**

Run from the repository root:

```bash
python3 /Users/lukukutony/.codex/skills/.system/plugin-creator/scripts/create_basic_plugin.py suno-music \
  --path /Users/lukukutony/Documents/work-with-tony/plugins \
  --with-skills \
  --with-marketplace \
  --marketplace-path /Users/lukukutony/Documents/work-with-tony/.agents/plugins/marketplace.json \
  --marketplace-name work-with-tony \
  --install-policy AVAILABLE \
  --auth-policy ON_INSTALL \
  --category Creative
```

Expected: a validation-ready minimal Codex manifest, an empty `skills/` directory, and a `work-with-tony` marketplace containing `suno-music`.

- [ ] **Step 2: Write the package helpers and failing package test**

Create `plugins/suno-music/tests/helpers.mjs`:

```js
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(pluginRoot, "..", "..");

export function readText(relativePath, base = pluginRoot) {
  return readFileSync(resolve(base, relativePath), "utf8");
}

export function readJson(relativePath, base = pluginRoot) {
  return JSON.parse(readText(relativePath, base));
}
```

Create `plugins/suno-music/tests/package.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { pluginRoot, readJson, repoRoot } from "./helpers.mjs";

test("Codex manifest declares the Suno prepare skill", () => {
  const manifest = readJson(".codex-plugin/plugin.json");
  assert.equal(manifest.name, "suno-music");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.author.name, "Tony (Eunjae Lee)");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.interface.displayName, "Suno Music");
  assert.equal(manifest.interface.category, "Creative");
  assert.deepEqual(manifest.interface.capabilities, ["Interactive", "Browser"]);
  assert.ok(Array.isArray(manifest.interface.defaultPrompt));
});

test("repository marketplace lists existing and new plugins", () => {
  const marketplace = readJson(".agents/plugins/marketplace.json", repoRoot);
  assert.equal(marketplace.name, "work-with-tony");
  assert.equal(marketplace.interface.displayName, "Work With Tony");
  assert.deepEqual(marketplace.plugins.map((entry) => entry.name), ["linkedin-post", "suno-music"]);
  const suno = marketplace.plugins.find((entry) => entry.name === "suno-music");
  assert.equal(suno.source.path, "./plugins/suno-music");
  assert.deepEqual(suno.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
  assert.equal(suno.category, "Creative");
});

test("package has no executable integration or runtime dependency", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
  assert.equal(pkg.dependencies, undefined);
  assert.equal(existsSync(resolve(pluginRoot, ".mcp.json")), false);
  assert.equal(existsSync(resolve(pluginRoot, ".claude-plugin")), false);
});
```

- [ ] **Step 3: Run the package test and verify it fails for the intended gaps**

Run:

```bash
node --test plugins/suno-music/tests/package.test.mjs
```

Expected: FAIL because the scaffold still has its default author/interface metadata, `package.json` is absent, and the marketplace does not yet include `linkedin-post`.

- [ ] **Step 4: Add the complete manifest, package metadata, and catalog entries**

Replace the scaffold manifest with:

```json
{
  "name": "suno-music",
  "version": "0.1.0",
  "description": "Prepare Suno Advanced song forms from approved lyrics and style without spending credits.",
  "author": { "name": "Tony (Eunjae Lee)" },
  "homepage": "https://github.com/ej-rarus/work-with-tony",
  "repository": "https://github.com/ej-rarus/work-with-tony",
  "license": "MIT",
  "keywords": ["suno", "music", "lyrics", "browser", "creative"],
  "skills": "./skills/",
  "interface": {
    "displayName": "Suno Music",
    "shortDescription": "Prepare a Suno song form for review",
    "longDescription": "Fill Suno's Advanced form with approved title, lyrics, style, and options, verify the result, and stop before credit-spending creation.",
    "developerName": "Tony (Eunjae Lee)",
    "category": "Creative",
    "capabilities": ["Interactive", "Browser"],
    "defaultPrompt": [
      "$suno-music:prepare 이 가사와 스타일을 Suno에 입력해줘",
      "확정한 제목, 가사, 스타일로 Suno 입력 화면을 준비해줘"
    ]
  }
}
```

Create `plugins/suno-music/package.json`:

```json
{
  "name": "suno-music-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": { "test": "node --test tests/*.test.mjs" }
}
```

Set `.agents/plugins/marketplace.json` to:

```json
{
  "name": "work-with-tony",
  "interface": { "displayName": "Work With Tony" },
  "plugins": [
    {
      "name": "linkedin-post",
      "source": { "source": "local", "path": "./plugins/linkedin-post" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    },
    {
      "name": "suno-music",
      "source": { "source": "local", "path": "./plugins/suno-music" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Creative"
    }
  ]
}
```

- [ ] **Step 5: Run the package test**

Run: `node --test plugins/suno-music/tests/package.test.mjs`  
Expected: all package tests PASS.

- [ ] **Step 6: Commit the package and marketplace**

```bash
git add .agents/plugins/marketplace.json plugins/suno-music/.codex-plugin/plugin.json plugins/suno-music/package.json plugins/suno-music/tests
git commit -m "feat(suno-music): scaffold Codex web prepare plugin"
```

### Task 2: Add the safe Suno form-preparation workflow

**Files:**
- Create: `plugins/suno-music/skills/prepare/SKILL.md`
- Create: `plugins/suno-music/README.md`
- Modify: `plugins/suno-music/tests/package.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: user-provided `title?`, `lyrics`, `style`, `vocalGender?`, `model?`, and `excludeStyles?` from the current conversation.
- Produces: a verified, user-visible Suno Advanced form and no song-generation action.

- [ ] **Step 1: Extend the package test with failing workflow assertions**

First change the existing helper import in `plugins/suno-music/tests/package.test.mjs` to:

```js
import { pluginRoot, readJson, readText, repoRoot } from "./helpers.mjs";
```

Then append these tests:

```js
test("prepare skill defines the semantic Suno form workflow", () => {
  const skill = readText("skills/prepare/SKILL.md");
  assert.match(skill, /^---\nname: prepare\ndescription: .+\n---\n/);
  for (const required of [
    "https://suno.com/create",
    "Advanced",
    "Lyrics editor",
    "Styles",
    "Song Title (Optional)",
    "Male",
    "Female",
    "5,000",
    "1,000",
  ]) assert.ok(skill.includes(required), `prepare skill missing ${required}`);
});

test("prepare skill preserves user text and forbids credit-spending actions", () => {
  const skill = readText("skills/prepare/SKILL.md");
  assert.match(skill, /preserve.*exactly/i);
  assert.match(skill, /Never click, press, or otherwise invoke `Create song`/);
  assert.match(skill, /existing form.*confirmation/i);
  assert.match(skill, /fresh browser state/i);
  assert.match(skill, /fixed coordinates/i);
  assert.doesNotMatch(skill, /click\([^\n]*Create song/i);
});

test("documentation describes prepare-only scope and Codex installation", () => {
  const pluginReadme = readText("README.md");
  const rootReadme = readText("README.md", repoRoot);
  assert.ok(pluginReadme.includes("$suno-music:prepare"));
  assert.ok(pluginReadme.includes("Create song"));
  assert.ok(pluginReadme.includes("does not"));
  assert.ok(rootReadme.includes("codex plugin marketplace add ej-rarus/work-with-tony"));
  assert.ok(rootReadme.includes("suno-music@work-with-tony"));
});
```

- [ ] **Step 2: Run the package test and verify the workflow assertions fail**

Run: `node --test plugins/suno-music/tests/package.test.mjs`  
Expected: FAIL because `skills/prepare/SKILL.md`, the plugin README, and Suno catalog documentation do not exist yet.

- [ ] **Step 3: Write the prepare skill**

Create `plugins/suno-music/skills/prepare/SKILL.md` with the following complete workflow:

```markdown
---
name: prepare
description: Fill Suno's Advanced creation form with user-approved title, lyrics, style, and optional settings, verify the populated values, and stop before generation. Use when the user types $suno-music:prepare or asks to put lyrics and style into Suno.
---

# Suno Music Prepare

Prepare the form; the user creates the song. Never click, press, or otherwise invoke `Create song`.

## 1. Collect and validate

Read `title` when supplied, plus required `lyrics` and `style`. Optional inputs are `vocalGender` (`male` or `female`), `model`, and `excludeStyles`.

Preserve the user's title, lyrics, and style exactly. Do not rewrite, translate, normalize whitespace, add section labels, or improve them unless the user asks. Count Unicode code points before browser use. Refuse to enter lyrics over 5,000 characters or style over 1,000 characters, and report the measured count.

Ask only for missing `lyrics` or `style`. Summarize the values that will be entered; invoking this skill or asking to enter them into Suno authorizes transmitting those exact values to `suno.com`.

## 2. Select the Suno page

Use browser control only. Reuse an open `https://suno.com/create` tab when available; otherwise open it. Do not use HTTP requests, private endpoints, page cookies, session tokens, shell browser automation, or a separate browser profile.

Read fresh browser state before every decision. If Suno shows a sign-in or session-recovery page, leave it visible for the user and stop. Do not enter credentials, complete CAPTCHA, change plans, buy credits, or modify account settings.

## 3. Inspect before changing anything

Select the `Advanced` tab if it is not already selected, then read fresh browser state again. Inspect the current values for `Lyrics editor`, the editable field inside the `Styles` section, `Song Title (Optional)`, and any requested options.

If the existing form contains a title, lyrics, style, or option value that this run would replace, show which fields are populated and request confirmation immediately before clearing or replacing them. Without that confirmation, stop with the existing form unchanged.

## 4. Fill by semantic labels

Use semantic labels and scope, not fixed coordinates or stale accessibility indexes:

1. Fill `Lyrics editor` with `lyrics`.
2. In the `Styles` section, fill its editable text field with `style`. Its accessible name may show rotating recommendation text, so scope the field to the expanded `Styles` section and require exactly one editable match.
3. Fill `Song Title (Optional)` when `title` was supplied.
4. Expand `More Options` only when `vocalGender` or `excludeStyles` was supplied. Fill `Exclude styles` when supplied; select `Male` or `Female` only for the corresponding requested value.
5. Change the model only when `model` was supplied and that exact model is visibly available in the model selector. Otherwise leave the current model unchanged and report that the requested model was unavailable.

After every interaction, read fresh browser state before the next interaction. If any field is missing or resolves ambiguously, stop and report the unresolved field; do not fall back to fixed coordinates.

## 5. Verify and hand off

Read back title, lyrics, style, requested vocal gender, requested model, and exclude styles. Compare text by exact code points and report any mismatch. Do not repair a mismatch by clearing a populated field unless the user already confirmed replacement.

When every requested value matches, leave the Suno tab visible and report `폼 준비 완료`. Remind the user that the form is prepared but no credits have been spent and no song has been created.

Never click, press, or otherwise invoke `Create song`, even when the same request says to generate, proceed, or create the song. Never upload audio, use Voice, use Inspo, open Saved lyrics, download, publish, or distribute a song.
```

- [ ] **Step 4: Write plugin and repository documentation**

Create `plugins/suno-music/README.md` describing:

- Codex-only requirement and installation commands.
- `$suno-music:prepare` and natural-language invocation examples.
- Required `lyrics` and `style`, optional title/options, and 5,000/1,000 limits.
- Reuse of the user's logged-in Suno browser session.
- Exact statement: “This plugin does not click `Create song`, spend credits, or download audio.”
- Troubleshooting for login required, occupied form, changed labels, and unavailable model.

Modify the root `README.md` to:

- Describe the repository as a Claude Code and Codex plugin catalog.
- Preserve the existing Claude marketplace command and LinkedIn row.
- Add Codex commands `codex plugin marketplace add ej-rarus/work-with-tony` and `codex plugin add suno-music@work-with-tony`.
- Add a `suno-music` table row describing safe Suno Advanced form preparation.

- [ ] **Step 5: Run tests and validate formatting**

Run:

```bash
node --test plugins/suno-music/tests/*.test.mjs
git diff --check
```

Expected: all tests PASS and `git diff --check` produces no output.

- [ ] **Step 6: Commit the skill and documentation**

```bash
git add README.md plugins/suno-music/README.md plugins/suno-music/skills/prepare/SKILL.md plugins/suno-music/tests/package.test.mjs
git commit -m "feat(suno-music): add safe Suno form preparation workflow"
```

### Task 3: Validate, install, and publish the plugin

**Files:**
- Modify only files introduced by Tasks 1-2 if validation finds a defect.

**Interfaces:**
- Consumes: completed `suno-music@0.1.0` package and `.agents/plugins/marketplace.json`.
- Produces: green validation evidence, local Codex installation, and a synchronized `origin/main`.

- [ ] **Step 1: Run the full package test suite**

Run:

```bash
cd /Users/lukukutony/Documents/work-with-tony/plugins/suno-music
npm test
cd /Users/lukukutony/Documents/work-with-tony
git diff --check
```

Expected: all tests PASS and no whitespace errors.

- [ ] **Step 2: Run the Codex plugin validator and marketplace-name validator**

Run:

```bash
python3 /Users/lukukutony/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py /Users/lukukutony/Documents/work-with-tony/plugins/suno-music
python3 /Users/lukukutony/.codex/skills/.system/plugin-creator/scripts/read_marketplace_name.py --marketplace-path /Users/lukukutony/Documents/work-with-tony/.agents/plugins/marketplace.json
```

Expected: plugin validation succeeds and the marketplace helper prints `work-with-tony`.

- [ ] **Step 3: Review the package for forbidden integration artifacts**

Run:

```bash
find plugins/suno-music -maxdepth 3 -type f -print | sort
rg -n "SUNO_API_KEY|api[_-]?key|session[_-]?token|\.mcp\.json|Create song.*click|click.*Create song" plugins/suno-music
```

Expected: the file list contains only the Codex manifest, skill, README, package metadata, and tests. Search output may contain tests and explicit prohibition prose, but no credential handling, MCP config, or instruction to click `Create song`.

- [ ] **Step 4: Install the repository marketplace and plugin locally**

Run `codex plugin marketplace list`. If `work-with-tony` is absent, run:

```bash
codex plugin marketplace add /Users/lukukutony/Documents/work-with-tony
```

Then run:

```bash
codex plugin add suno-music@work-with-tony
codex plugin list
```

Expected: `suno-music` is listed as installed from `work-with-tony`. Do not start a song generation or alter the current Suno form during installation verification.

- [ ] **Step 5: Inspect the final branch and commit validation fixes if necessary**

Run:

```bash
git status --short --branch
git diff --check
git log --oneline --decorate -8
```

If validation required changes, stage only `suno-music`, `.agents/plugins/marketplace.json`, and repository README files, then commit:

```bash
git commit -m "fix(suno-music): address validation findings"
```

- [ ] **Step 6: Push the completed implementation**

Run:

```bash
git push origin main
git status --short --branch
```

Expected: `main` matches `origin/main` and the worktree is clean. The installed plugin becomes available to newly started Codex tasks; do not claim the current task hot-loaded it.
