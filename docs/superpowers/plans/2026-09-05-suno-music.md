# Suno Music MCP Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a marketplace-distributed `suno-music` plugin that creates songs through Suno's official REST API, reads asynchronous generation status, and safely downloads completed audio.

**Architecture:** A bundled Node.js stdio MCP server exposes three stable tools and delegates authentication, upstream API translation, and downloads to focused modules. A conversation skill controls paid-action confirmation, while dual plugin manifests and dual marketplace catalogs make the same package available to Claude Code and Codex.

**Tech Stack:** Node.js 20+, ECMAScript modules, `@modelcontextprotocol/sdk`, esbuild, Node test runner, mocked `fetch`, Claude/Codex plugin manifests.

**Spec:** `docs/superpowers/specs/2026-09-05-suno-music-design.md`

## Global Constraints

- Use only Suno's official REST API; do not automate the Suno web creation UI.
- Require `confirmCreditSpend: true` for every paid generation call and never retry generation automatically.
- Keep API keys and downloaded audio outside Git; never print authentication headers or raw keys.
- Expose exactly `create_song`, `get_generation`, and `download_song` in version `0.1.0`.
- Support both Claude Code and Codex from `plugins/suno-music/`.
- Use Node.js 20 or newer and ship a bundled MCP entry point that needs no install-time dependency resolution.
- Tests and installation checks must not consume Suno credits.

---

### Task 1: Capture the authenticated official API contract

**Files:**
- Create: `plugins/suno-music/references/suno-api-contract.md`

**Interfaces:**
- Consumes: Suno Platform documentation visible after the user authorizes Google login and API access.
- Produces: Exact API base URL, authorization header shape, generation endpoint, status endpoint, request/response examples with secrets removed, supported model identifiers, and observed audio CDN hosts.

- [ ] **Step 1: Complete Suno Platform authentication with the user's chosen existing Google account**

Ask immediately before selecting the account because the OAuth step may create a persistent Suno API account. Do not copy cookies, tokens, or email addresses into the repository.

- [ ] **Step 2: Create one API key after an action-time confirmation**

The confirmation must say that Suno will create persistent API access for the selected account. Copy the key only into the protected local setup flow from Task 3; never place it in a command argument, chat message, shell history, or repository file.

- [ ] **Step 3: Record the sanitized contract**

Create `references/suno-api-contract.md` with this exact section structure and the literal values shown by the authenticated official documentation:

```markdown
# Suno official API contract

- Verified: 2026-09-05
- Source: https://platform.suno.com/

## Authentication
## Generate song
## Get generation
## Result tracks
## Models and options
## Audio download hosts
## Error responses
```

For every endpoint include method, absolute path, required headers, JSON request, successful JSON response, and documented error codes. Replace every credential with `[REDACTED]`.

- [ ] **Step 4: Verify the reference contains no secret**

Run:

```bash
rg -n "Bearer [A-Za-z0-9._-]{12,}|api[_-]?key.{0,8}[A-Za-z0-9._-]{12,}" plugins/suno-music/references/suno-api-contract.md
```

Expected: no output.

- [ ] **Step 5: Commit the sanitized contract**

```bash
git add plugins/suno-music/references/suno-api-contract.md
git commit -m "docs(suno-music): record official API contract"
```

### Task 2: Scaffold the dual-host plugin and marketplace packaging

**Files:**
- Create: `plugins/suno-music/.claude-plugin/plugin.json`
- Create: `plugins/suno-music/.codex-plugin/plugin.json`
- Create: `plugins/suno-music/.mcp.json`
- Create: `plugins/suno-music/package.json`
- Create: `plugins/suno-music/tests/plugin-package.test.mjs`
- Create: `.agents/plugins/marketplace.json`
- Modify: `.claude-plugin/marketplace.json`

**Interfaces:**
- Consumes: Repository conventions from `plugins/linkedin-post/`.
- Produces: Plugin identity `suno-music@0.1.0`, MCP server name `suno`, and marketplace entries for both hosts.

- [ ] **Step 1: Write the failing package test**

The test must load both manifests, `.mcp.json`, both marketplace files, and assert this shape:

```js
assert.equal(codex.name, "suno-music");
assert.equal(codex.version, "0.1.0");
assert.equal(codex.mcpServers, "./.mcp.json");
assert.equal(codex.skills, "./skills/");
assert.equal(mcp.mcpServers.suno.command, "node");
assert.deepEqual(mcp.mcpServers.suno.args, ["./mcp/server.bundle.mjs"]);
assert.ok(claudeMarketplace.plugins.some((plugin) => plugin.name === "suno-music"));
assert.ok(codexMarketplace.plugins.some((plugin) => plugin.name === "suno-music"));
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test plugins/suno-music/tests/plugin-package.test.mjs`  
Expected: FAIL because manifests and marketplace entry do not exist.

- [ ] **Step 3: Add the minimal package files**

Use `type: "module"`, Node `>=20`, runtime dependency `@modelcontextprotocol/sdk`, development dependency `esbuild`, and scripts:

```json
{
  "test": "node --test tests/*.test.mjs",
  "build": "node scripts/build.mjs",
  "configure": "node scripts/configure.mjs"
}
```

The stdio MCP config must be:

```json
{
  "mcpServers": {
    "suno": {
      "command": "node",
      "args": ["./mcp/server.bundle.mjs"],
      "cwd": "."
    }
  }
}
```

The Codex marketplace entry must use installation `AVAILABLE`, authentication `ON_INSTALL`, category `Creative`, and source path `./plugins/suno-music`. Seed the Codex marketplace with both `linkedin-post` and `suno-music` so the repo catalog is complete.

- [ ] **Step 4: Run the package test**

Run: `node --test plugins/suno-music/tests/plugin-package.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit packaging**

```bash
git add .claude-plugin/marketplace.json .agents/plugins/marketplace.json plugins/suno-music/.claude-plugin plugins/suno-music/.codex-plugin plugins/suno-music/.mcp.json plugins/suno-music/package.json plugins/suno-music/tests/plugin-package.test.mjs
git commit -m "feat(suno-music): scaffold marketplace plugin"
```

### Task 3: Implement protected API-key configuration

**Files:**
- Create: `plugins/suno-music/mcp/src/config.mjs`
- Create: `plugins/suno-music/scripts/configure.mjs`
- Create: `plugins/suno-music/tests/config.test.mjs`

**Interfaces:**
- Produces: `loadConfig({ env, homeDir, readFile }) -> Promise<{ apiKey: string, source: "env" | "file" }>` and `redactSecret(text, secret) -> string`.
- Consumes: `SUNO_API_KEY`, or `~/.suno-music/config.json` with `{ "apiKey": "..." }`.

- [ ] **Step 1: Write failing configuration tests**

Cover environment precedence, protected JSON fallback, missing key, malformed JSON, whitespace-only key, and redaction:

```js
const result = await loadConfig({
  env: { SUNO_API_KEY: "env-secret" },
  homeDir: "/tmp/home",
  readFile: async () => JSON.stringify({ apiKey: "file-secret" })
});
assert.deepEqual(result, { apiKey: "env-secret", source: "env" });
assert.equal(redactSecret("Bearer env-secret", "env-secret"), "Bearer [REDACTED]");
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test plugins/suno-music/tests/config.test.mjs`  
Expected: FAIL because `config.mjs` does not exist.

- [ ] **Step 3: Implement config loading and redaction**

Use `node:path`, `node:fs/promises`, and a typed `SunoConfigError` with codes `CONFIG_MISSING` and `CONFIG_INVALID`. The configure script must read the key without echo, write a temporary file with mode `0600`, rename it to `~/.suno-music/config.json`, and print only the destination path.

- [ ] **Step 4: Run configuration tests**

Run: `node --test plugins/suno-music/tests/config.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit configuration support**

```bash
git add plugins/suno-music/mcp/src/config.mjs plugins/suno-music/scripts/configure.mjs plugins/suno-music/tests/config.test.mjs
git commit -m "feat(suno-music): add protected API configuration"
```

### Task 4: Implement the Suno REST client

**Files:**
- Create: `plugins/suno-music/mcp/src/errors.mjs`
- Create: `plugins/suno-music/mcp/src/suno-client.mjs`
- Create: `plugins/suno-music/tests/suno-client.test.mjs`

**Interfaces:**
- Consumes: Exact endpoint and payload contract from `references/suno-api-contract.md`.
- Produces: `createSunoClient({ apiKey, fetchImpl, sleep })` returning `createSong(input)` and `getGeneration(generationId)`.
- Produces normalized generation objects: `{ id, status, message, tracks: [{ id, title, audioUrl, contentType }], raw }`.

- [ ] **Step 1: Write failing client tests from the sanitized official examples**

Tests must assert the exact authorization header, official path, official request field names, response normalization, secret redaction, and error mapping. Include these invariants:

```js
await assert.rejects(
  () => client.createSong({ title: "x", lyrics: "y", style: "z", confirmCreditSpend: false }),
  (error) => error.code === "CREDIT_CONFIRMATION_REQUIRED"
);
assert.equal(generation.tracks[0].audioUrl, officialFixtureAudioUrl);
```

Also assert one fetch call for `createSong` after network failure, and at most three total fetch calls for retryable `getGeneration` failures.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test plugins/suno-music/tests/suno-client.test.mjs`  
Expected: FAIL because client modules do not exist.

- [ ] **Step 3: Implement request validation and error mapping**

Reject missing title, lyrics, or style; unsupported enum values; false confirmation; non-2xx responses; invalid JSON; and malformed successful payloads. Map authentication, insufficient credits, rate limiting, validation, upstream, and uncertain network failures to stable local codes.

- [ ] **Step 4: Implement official request and response adapters**

Keep official field names confined to `suno-client.mjs`. Expose only normalized inputs and outputs to the MCP server. Preserve `raw` for forward compatibility after recursively removing fields whose keys match `/authorization|api.?key|token|secret/i`.

- [ ] **Step 5: Run client tests**

Run: `node --test plugins/suno-music/tests/suno-client.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit the client**

```bash
git add plugins/suno-music/mcp/src/errors.mjs plugins/suno-music/mcp/src/suno-client.mjs plugins/suno-music/tests/suno-client.test.mjs
git commit -m "feat(suno-music): wrap official generation API"
```

### Task 5: Implement safe completed-audio downloads

**Files:**
- Create: `plugins/suno-music/mcp/src/download.mjs`
- Create: `plugins/suno-music/tests/download.test.mjs`

**Interfaces:**
- Consumes: Normalized generation from `client.getGeneration(id)` and allowed CDN hosts from `references/suno-api-contract.md`.
- Produces: `downloadGenerationTrack({ client, generationId, outputDirectory, trackIndex, fileName, fetchImpl }) -> Promise<{ path, bytes, contentType }>`.

- [ ] **Step 1: Write failing download tests**

Cover incomplete status, invalid index, relative output path, non-HTTPS URL, unapproved host, filename sanitization, collision suffixes, fetch failure, partial-file cleanup, and successful atomic rename:

```js
const result = await downloadGenerationTrack({
  client: fakeCompletedClient,
  generationId: "gen-1",
  outputDirectory: tempDir,
  trackIndex: 0,
  fileName: "응답만 없음.wav",
  fetchImpl: fakeAudioFetch
});
assert.equal(result.path, join(tempDir, "응답만 없음.wav"));
assert.equal(await readFile(result.path, "utf8"), "audio-bytes");
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test plugins/suno-music/tests/download.test.mjs`  
Expected: FAIL because `download.mjs` does not exist.

- [ ] **Step 3: Implement guarded streaming download**

Resolve the audio URL only through `getGeneration`; require completed status, HTTPS, and an allowlisted host. Write to `.${safeFileName}.${randomUUID()}.part` with exclusive creation, stream bytes, close the handle, and rename atomically. In `finally`, remove only the exact temporary path if it still exists.

- [ ] **Step 4: Run download tests**

Run: `node --test plugins/suno-music/tests/download.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit download support**

```bash
git add plugins/suno-music/mcp/src/download.mjs plugins/suno-music/tests/download.test.mjs
git commit -m "feat(suno-music): add safe audio downloads"
```

### Task 6: Expose and bundle the MCP server

**Files:**
- Create: `plugins/suno-music/mcp/src/server.mjs`
- Create: `plugins/suno-music/scripts/build.mjs`
- Create: `plugins/suno-music/mcp/server.bundle.mjs`
- Create: `plugins/suno-music/tests/server.test.mjs`

**Interfaces:**
- Consumes: `loadConfig`, `createSunoClient`, and `downloadGenerationTrack`.
- Produces: stdio MCP tools `create_song`, `get_generation`, and `download_song` with JSON Schema inputs matching the design spec.

- [ ] **Step 1: Write failing server tests**

Inject fake client/config/download dependencies into `createServer(dependencies)`. Assert exact tool names, schemas, successful text plus structured output, stable error output, and absence of secrets:

```js
assert.deepEqual(toolNames, ["create_song", "download_song", "get_generation"]);
assert.equal(createSchema.properties.confirmCreditSpend.const, true);
assert.doesNotMatch(JSON.stringify(errorResult), /test-secret/);
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test plugins/suno-music/tests/server.test.mjs`  
Expected: FAIL because the server does not exist.

- [ ] **Step 3: Implement the server and tool handlers**

Use `Server` and `StdioServerTransport` from `@modelcontextprotocol/sdk`. Return concise Korean-readable summaries in text content and machine-readable JSON in structured content. Never start stdio transport when `server.mjs` is imported by tests; start only when `import.meta.url` equals the executed entry URL.

- [ ] **Step 4: Add deterministic bundling**

`scripts/build.mjs` must call esbuild with entry point `mcp/src/server.mjs`, platform `node`, format `esm`, target `node20`, bundle enabled, sourcemap disabled, and output `mcp/server.bundle.mjs`.

- [ ] **Step 5: Install dependencies, run tests, and build**

Run:

```bash
cd plugins/suno-music
npm install
npm test
npm run build
node --check mcp/server.bundle.mjs
```

Expected: all tests PASS and bundle syntax check succeeds.

- [ ] **Step 6: Commit server and lockfile**

```bash
git add plugins/suno-music/mcp plugins/suno-music/scripts/build.mjs plugins/suno-music/tests/server.test.mjs plugins/suno-music/package-lock.json
git commit -m "feat(suno-music): expose bundled MCP tools"
```

### Task 7: Add the conversational skill and user documentation

**Files:**
- Create: `plugins/suno-music/skills/create/SKILL.md`
- Create: `plugins/suno-music/README.md`
- Modify: `README.md`
- Modify: `plugins/suno-music/tests/plugin-package.test.mjs`

**Interfaces:**
- Consumes: MCP tool names and setup command from earlier tasks.
- Produces: `$suno-music:create` workflow and install/setup documentation.

- [ ] **Step 1: Extend the failing package test**

Assert skill frontmatter name `create`, the README contains `npm run configure`, all three MCP tool names, the credit-confirmation rule, and root README contains the marketplace install command.

- [ ] **Step 2: Run the package test and verify it fails**

Run: `node --test plugins/suno-music/tests/plugin-package.test.mjs`  
Expected: FAIL because skill and documentation do not exist.

- [ ] **Step 3: Write the skill**

The skill workflow must:

1. Read user-provided lyrics and style without rewriting unless asked.
2. Summarize title, model, vocal gender, and credit-spending consequence.
3. Call `create_song` only after explicit user approval.
4. Use `get_generation` for status without silently regenerating.
5. Download only after the user gives a destination directory.
6. Distinguish submitted, processing, completed, downloaded, and externally released states.

- [ ] **Step 4: Write plugin and catalog documentation**

Document Claude Code and Codex installation, API key setup, example prompts, tool behavior, security, credit use, supported scope, and troubleshooting. Do not include an actual key or generated audio URL.

- [ ] **Step 5: Run documentation/package tests**

Run: `node --test plugins/suno-music/tests/plugin-package.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit docs and skill**

```bash
git add README.md plugins/suno-music/README.md plugins/suno-music/skills plugins/suno-music/tests/plugin-package.test.mjs
git commit -m "docs(suno-music): add creation workflow and setup guide"
```

### Task 8: Validate, install locally, and publish to GitHub

**Files:**
- Modify only if validation finds a defect in files introduced by Tasks 1-7.

**Interfaces:**
- Consumes: Completed plugin, repository marketplaces, and bundled server.
- Produces: Green test/validation evidence, locally installed plugin, and pushed GitHub `main`.

- [ ] **Step 1: Run the full automated test suite**

Run:

```bash
cd plugins/suno-music
npm test
npm run build
git diff --check
```

Expected: all tests PASS, bundle rebuild succeeds, and no whitespace errors.

- [ ] **Step 2: Run both plugin validators**

Run from repository root:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/suno-music
claude plugin validate ./plugins/suno-music --strict
```

Expected: both validators pass.

- [ ] **Step 3: Install the repository marketplace locally**

Use `codex plugin marketplace list` to check whether `/Users/lukukutony/Documents/work-with-tony` is configured. If absent, run:

```bash
codex plugin marketplace add /Users/lukukutony/Documents/work-with-tony
```

Then install:

```bash
codex plugin add suno-music@work-with-tony
```

Do not edit Codex cache or global config by hand.

- [ ] **Step 4: Verify installation without spending credits**

Run `codex plugin list`, start a new Codex task, and confirm the plugin exposes the `create` skill and three Suno MCP tools. Do not call `create_song`.

- [ ] **Step 5: Inspect repository state and commit any validation fixes**

Run:

```bash
git status --short
git diff --check
git log --oneline --decorate -10
```

If tracked implementation changes remain after the task commits, stage only `suno-music` and catalog files and commit them as `fix(suno-music): address validation findings`.

- [ ] **Step 6: Push the completed history**

Run:

```bash
git push origin main
git status --short --branch
```

Expected: local `main` matches `origin/main` and the worktree is clean.
