# linkedin-post Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code 스킬 하나로 LinkedIn 개인 프로필 텍스트 게시글을 작성·확정·즉시 발행하는 플러그인을 `work-with-tony` 마켓플레이스 카탈로그 구조로 만든다.

**Architecture:** SKILL.md가 글쓰기와 대화 흐름을 담당하고, 의존성 0인 Node 스크립트 두 개(auth, publish)가 LinkedIn OAuth와 Posts API만 담당한다. 스크립트는 stdout에 JSON 한 줄을 내보내고 SKILL.md가 이를 해석한다. 개인 데이터(client 정보, 토큰, 참고 글, 게시 이력)는 레포 밖 `~/.linkedin-post/`에 둔다.

**Tech Stack:** Node 20+ (내장 fetch, `node:test`, `node:http`), ES modules, 외부 npm 의존성 없음. Claude Code plugin manifest (`.claude-plugin/plugin.json`, `marketplace.json`).

**Spec:** `docs/superpowers/specs/2026-09-04-linkedin-post-design.md`

## Global Constraints

- Node `>=20`, 외부 npm 의존성 0. 테스트는 `node --test tests/*.test.mjs`.
- 레포 루트: `~/Documents/work-with-tony/`. 플러그인 루트: `plugins/linkedin-post/`. 이하 경로는 모두 플러그인 루트 기준이며, 레포 루트 파일은 `<repo>/`로 표기.
- 마켓플레이스 이름 `work-with-tony`, 플러그인 이름 `linkedin-post`, 초기 버전 `0.1.0`.
- 개인 데이터 홈: 환경변수 `LINKEDIN_POST_HOME`, 기본 `~/.linkedin-post`. 하위 `config.json`, `token.json`, `references/`, `drafts/`, `published/`, `my-style.md`.
- OAuth: redirect URI `http://localhost:8585/callback`, scope `openid profile w_member_social`, 콜백 타임아웃 120초.
- Posts API: `POST https://api.linkedin.com/rest/posts`, 헤더 `LinkedIn-Version: 202508`, `X-Restli-Protocol-Version: 2.0.0`. userinfo: `GET https://api.linkedin.com/v2/userinfo`.
- 본문 상한 3000자. 토큰 만료 임박 기준 7일.
- LinkedIn 예약 문자: `\ | { } @ [ ] ( ) < > # * _ ~` 를 백슬래시로 이스케이프.
- 종료 코드: 0 성공, 1 API 실패, 2 사전조건 실패(설정·검증·토큰 만료).
- secret·token은 stdout/stderr/대화에 출력 금지. `token.json` 권한 0600.
- 5xx는 재시도하지 않는다(중복 게시 방지). 네트워크 오류만 3초 후 1회 재시도.
- LUKUKU 브랜딩 없음. 개인(Tony) 브랜딩만.
- 스크립트·SKILL.md·README는 영어로 작성한다(공개 마켓플레이스 대상). 게시글 기본 언어는 한국어.
- 각 태스크 마지막의 커밋 단계는 사용자가 이 계획을 승인했을 때 실행한다. push는 하지 않는다.

---

## File Structure

```
<repo>/
├── .claude-plugin/marketplace.json     카탈로그 (Task 1)
├── README.md                           카탈로그 소개·설치 (Task 10)
├── .gitignore                          (Task 1)
└── plugins/linkedin-post/
    ├── .claude-plugin/plugin.json      (Task 1)
    ├── package.json                    test 스크립트 (Task 1)
    ├── README.md                       개발자 앱 생성·설치·설정 (Task 10)
    ├── skills/linkedin-post/
    │   ├── SKILL.md                    대화 흐름 (Task 9)
    │   └── references/
    │       ├── style-guide.md          (Task 8)
    │       └── post-types.md           (Task 8)
    ├── scripts/
    │   ├── auth.mjs                    OAuth CLI (Task 7)
    │   ├── publish.mjs                 발행 CLI (Task 6)
    │   └── lib/
    │       ├── config.mjs              경로·config·token 로딩/저장 (Task 2)
    │       ├── redact.mjs              secret 마스킹 (Task 2)
    │       ├── text-format.mjs         예약 문자 이스케이프 (Task 3)
    │       ├── linkedin-api.mjs        userinfo·posts 클라이언트, 에러 매핑 (Task 4)
    │       └── oauth.mjs               인가 URL·콜백 파싱·코드 교환 (Task 5)
    └── tests/
        ├── helpers.mjs                 임시 홈 생성 등 (Task 2)
        ├── plugin-package.test.mjs     (Task 1, Task 9에서 확장)
        ├── config.test.mjs             (Task 2)
        ├── text-format.test.mjs        (Task 3)
        ├── linkedin-api.test.mjs       (Task 4)
        ├── oauth.test.mjs              (Task 5)
        └── publish.test.mjs            (Task 6)
```

---

### Task 1: 레포·플러그인 스캐폴드와 패키지 테스트

**Files:**
- Create: `<repo>/.claude-plugin/marketplace.json`
- Create: `<repo>/.gitignore`
- Create: `.claude-plugin/plugin.json`
- Create: `package.json`
- Create: `tests/helpers.mjs`
- Test: `tests/plugin-package.test.mjs`

**Interfaces:**
- Produces: `tests/helpers.mjs` exports `pluginRoot` (절대경로), `readJson(relPath)`, `readText(relPath)`, `makeTempHome()` → `{ home, cleanup() }`.

- [ ] **Step 1: 테스트 헬퍼 작성**

`tests/helpers.mjs`:
```js
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(pluginRoot, "..", "..");

export function readText(relPath, base = pluginRoot) {
  return readFileSync(resolve(base, relPath), "utf8");
}

export function readJson(relPath, base = pluginRoot) {
  return JSON.parse(readText(relPath, base));
}

export function makeTempHome() {
  const home = mkdtempSync(join(tmpdir(), "linkedin-post-test-"));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}
```

- [ ] **Step 2: 실패하는 패키지 테스트 작성**

`tests/plugin-package.test.mjs`:
```js
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { pluginRoot, readJson, repoRoot } from "./helpers.mjs";

test("plugin.json declares name, version, description, author", () => {
  const manifest = readJson(".claude-plugin/plugin.json");
  assert.equal(manifest.name, "linkedin-post");
  assert.equal(manifest.version, "0.1.0");
  assert.ok(manifest.description.length > 20);
  assert.equal(manifest.author.name, "Tony (Eunjae Lee)");
});

test("marketplace.json lists linkedin-post with matching version", () => {
  const market = readJson(".claude-plugin/marketplace.json", repoRoot);
  assert.equal(market.name, "work-with-tony");
  const entry = market.plugins.find((p) => p.name === "linkedin-post");
  assert.ok(entry, "linkedin-post entry missing");
  assert.equal(entry.source, "./plugins/linkedin-post");
  assert.equal(entry.version, readJson(".claude-plugin/plugin.json").version);
});

test("package.json has zero runtime dependencies and node>=20", () => {
  const pkg = readJson("package.json");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

test("no secret-looking values are committed in the plugin", () => {
  const patterns = [/AQ[A-Za-z0-9_-]{60,}/, /client_secret"\s*:\s*"[^"]{8,}"/i];
  for (const file of walk(pluginRoot)) {
    const text = readFileSync(file, "utf8");
    for (const p of patterns) assert.ok(!p.test(text), `secret pattern in ${file}`);
  }
});

test("repo .gitignore excludes local env and node_modules", () => {
  const ignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf8");
  assert.match(ignore, /node_modules/);
  assert.match(ignore, /\.env/);
  assert.ok(existsSync(resolve(repoRoot, ".gitignore")));
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd ~/Documents/work-with-tony/plugins/linkedin-post && node --test tests/plugin-package.test.mjs`
Expected: FAIL (ENOENT on `.claude-plugin/plugin.json`)

- [ ] **Step 4: 매니페스트·패키지 파일 작성**

`.claude-plugin/plugin.json`:
```json
{
  "name": "linkedin-post",
  "version": "0.1.0",
  "description": "Draft LinkedIn posts in conversation and publish them to your personal profile through the official LinkedIn API.",
  "author": { "name": "Tony (Eunjae Lee)", "url": "https://github.com/ej-rarus" },
  "repository": "https://github.com/ej-rarus/work-with-tony",
  "license": "MIT",
  "keywords": ["linkedin", "writing", "social", "publishing"]
}
```

`<repo>/.claude-plugin/marketplace.json`:
```json
{
  "name": "work-with-tony",
  "description": "Tony's personal toolkit of Claude Code plugins",
  "owner": { "name": "Tony (Eunjae Lee)", "url": "https://github.com/ej-rarus" },
  "plugins": [
    {
      "name": "linkedin-post",
      "description": "Draft LinkedIn posts in conversation and publish them to your personal profile through the official LinkedIn API.",
      "version": "0.1.0",
      "source": "./plugins/linkedin-post",
      "author": { "name": "Tony (Eunjae Lee)" }
    }
  ]
}
```

`package.json`:
```json
{
  "name": "linkedin-post-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "auth": "node scripts/auth.mjs",
    "publish:post": "node scripts/publish.mjs"
  }
}
```

`<repo>/.gitignore`:
```
node_modules/
.env
.env.*
.DS_Store
*.log
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/plugin-package.test.mjs`
Expected: 5 passing

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/work-with-tony
git add .claude-plugin .gitignore plugins/linkedin-post/.claude-plugin plugins/linkedin-post/package.json plugins/linkedin-post/tests docs
git commit -m "chore: scaffold work-with-tony marketplace and linkedin-post plugin"
```

---

### Task 2: config.mjs (경로·설정·토큰) 와 redact.mjs

**Files:**
- Create: `scripts/lib/config.mjs`
- Create: `scripts/lib/redact.mjs`
- Test: `tests/config.test.mjs`

**Interfaces:**
- Produces (`config.mjs`):
  - `class ConfigError extends Error { code: "MISSING_CONFIG"|"INVALID_CONFIG"|"MISSING_FIELD"|"MISSING_TOKEN"|"INVALID_TOKEN"; hint: string }`
  - `getHome(env = process.env)` → string
  - `getPaths(home)` → `{ home, config, token, references, drafts, published, myStyle }`
  - `ensureDirs(home)` → void (references/drafts/published 생성)
  - `loadConfig(home)` → `{ clientId, clientSecret }`
  - `loadToken(home)` → `{ accessToken, expiresAt, personUrn, name }`
  - `saveToken(home, token)` → void (0600)
  - `tokenStatus(token, now = Date.now())` → `"valid"|"expiring"|"expired"`
  - `EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000`
- Produces (`redact.mjs`): `redact(text, secrets: string[])` → string, 각 secret을 `***`로 치환.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/config.test.mjs`:
```js
import assert from "node:assert/strict";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  ConfigError, EXPIRING_WINDOW_MS, ensureDirs, getHome, getPaths,
  loadConfig, loadToken, saveToken, tokenStatus,
} from "../scripts/lib/config.mjs";
import { redact } from "../scripts/lib/redact.mjs";
import { makeTempHome } from "./helpers.mjs";

test("getHome prefers LINKEDIN_POST_HOME and falls back to ~/.linkedin-post", () => {
  assert.equal(getHome({ LINKEDIN_POST_HOME: "/x/y" }), "/x/y");
  assert.match(getHome({ HOME: "/Users/me" }), /\/Users\/me\/\.linkedin-post$/);
});

test("getPaths returns all expected child paths", () => {
  const p = getPaths("/h");
  assert.deepEqual(p, {
    home: "/h", config: "/h/config.json", token: "/h/token.json",
    references: "/h/references", drafts: "/h/drafts", published: "/h/published",
    myStyle: "/h/my-style.md",
  });
});

test("ensureDirs creates references, drafts, published", () => {
  const { home, cleanup } = makeTempHome();
  try {
    ensureDirs(home);
    for (const d of ["references", "drafts", "published"]) {
      assert.ok(statSync(join(home, d)).isDirectory());
    }
  } finally { cleanup(); }
});

test("loadConfig throws MISSING_CONFIG when file is absent", () => {
  const { home, cleanup } = makeTempHome();
  try {
    assert.throws(() => loadConfig(home), (e) => e instanceof ConfigError && e.code === "MISSING_CONFIG");
  } finally { cleanup(); }
});

test("loadConfig throws INVALID_CONFIG on bad JSON and MISSING_FIELD on missing keys", () => {
  const { home, cleanup } = makeTempHome();
  try {
    writeFileSync(join(home, "config.json"), "{not json");
    assert.throws(() => loadConfig(home), (e) => e.code === "INVALID_CONFIG");
    writeFileSync(join(home, "config.json"), JSON.stringify({ client_id: "abc" }));
    assert.throws(() => loadConfig(home), (e) => e.code === "MISSING_FIELD" && /client_secret/.test(e.message));
  } finally { cleanup(); }
});

test("loadConfig returns camelCase fields", () => {
  const { home, cleanup } = makeTempHome();
  try {
    writeFileSync(join(home, "config.json"), JSON.stringify({ client_id: "id1", client_secret: "sec1" }));
    assert.deepEqual(loadConfig(home), { clientId: "id1", clientSecret: "sec1" });
  } finally { cleanup(); }
});

test("saveToken writes 0600 and loadToken round-trips", () => {
  const { home, cleanup } = makeTempHome();
  try {
    const token = { accessToken: "tok", expiresAt: 1700000000000, personUrn: "urn:li:person:abc", name: "Tony" };
    saveToken(home, token);
    const mode = statSync(join(home, "token.json")).mode & 0o777;
    assert.equal(mode, 0o600);
    assert.deepEqual(loadToken(home), token);
  } finally { cleanup(); }
});

test("loadToken throws MISSING_TOKEN and INVALID_TOKEN", () => {
  const { home, cleanup } = makeTempHome();
  try {
    assert.throws(() => loadToken(home), (e) => e.code === "MISSING_TOKEN");
    writeFileSync(join(home, "token.json"), JSON.stringify({ accessToken: "x" }));
    assert.throws(() => loadToken(home), (e) => e.code === "INVALID_TOKEN");
  } finally { cleanup(); }
});

test("tokenStatus distinguishes valid, expiring, expired", () => {
  const now = 1_000_000_000_000;
  assert.equal(tokenStatus({ expiresAt: now + EXPIRING_WINDOW_MS + 1 }, now), "valid");
  assert.equal(tokenStatus({ expiresAt: now + 1000 }, now), "expiring");
  assert.equal(tokenStatus({ expiresAt: now - 1 }, now), "expired");
});

test("redact replaces every secret occurrence and ignores empty secrets", () => {
  assert.equal(redact("Bearer abc123 and abc123", ["abc123", ""]), "Bearer *** and ***");
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/config.test.mjs`
Expected: FAIL (Cannot find module config.mjs)

- [ ] **Step 3: 구현**

`scripts/lib/redact.mjs`:
```js
export function redact(text, secrets) {
  return secrets
    .filter((s) => typeof s === "string" && s.length > 0)
    .reduce((acc, s) => acc.split(s).join("***"), String(text));
}
```

`scripts/lib/config.mjs`:
```js
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const HINTS = {
  MISSING_CONFIG: "Create config.json with client_id and client_secret. See README: 'LinkedIn developer app'.",
  INVALID_CONFIG: "config.json is not valid JSON. Fix or delete it and run setup again.",
  MISSING_FIELD: "config.json must contain both client_id and client_secret.",
  MISSING_TOKEN: "Run `node scripts/auth.mjs` to sign in to LinkedIn.",
  INVALID_TOKEN: "token.json is malformed. Delete it and run `node scripts/auth.mjs` again.",
};

export class ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
    this.hint = HINTS[code];
  }
}

export function getHome(env = process.env) {
  if (env.LINKEDIN_POST_HOME) return env.LINKEDIN_POST_HOME;
  return join(env.HOME ?? homedir(), ".linkedin-post");
}

export function getPaths(home) {
  return {
    home,
    config: join(home, "config.json"),
    token: join(home, "token.json"),
    references: join(home, "references"),
    drafts: join(home, "drafts"),
    published: join(home, "published"),
    myStyle: join(home, "my-style.md"),
  };
}

export function ensureDirs(home) {
  const p = getPaths(home);
  for (const dir of [p.home, p.references, p.drafts, p.published]) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJsonFile(path, missingCode, invalidCode) {
  if (!existsSync(path)) throw new ConfigError(missingCode, `${path} not found`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ConfigError(invalidCode, `${path} is not valid JSON`);
  }
}

export function loadConfig(home) {
  const raw = readJsonFile(getPaths(home).config, "MISSING_CONFIG", "INVALID_CONFIG");
  const missing = ["client_id", "client_secret"].filter((k) => !raw[k]);
  if (missing.length) throw new ConfigError("MISSING_FIELD", `config.json missing: ${missing.join(", ")}`);
  return { clientId: raw.client_id, clientSecret: raw.client_secret };
}

const TOKEN_FIELDS = ["accessToken", "expiresAt", "personUrn", "name"];

export function loadToken(home) {
  const raw = readJsonFile(getPaths(home).token, "MISSING_TOKEN", "INVALID_TOKEN");
  const missing = TOKEN_FIELDS.filter((k) => raw[k] === undefined || raw[k] === null);
  if (missing.length) throw new ConfigError("INVALID_TOKEN", `token.json missing: ${missing.join(", ")}`);
  return Object.fromEntries(TOKEN_FIELDS.map((k) => [k, raw[k]]));
}

export function saveToken(home, token) {
  ensureDirs(home);
  const path = getPaths(home).token;
  writeFileSync(path, JSON.stringify(token, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function tokenStatus(token, now = Date.now()) {
  if (token.expiresAt <= now) return "expired";
  if (token.expiresAt - now <= EXPIRING_WINDOW_MS) return "expiring";
  return "valid";
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/config.test.mjs`
Expected: 10 passing

- [ ] **Step 5: Commit**

```bash
git add plugins/linkedin-post/scripts/lib/config.mjs plugins/linkedin-post/scripts/lib/redact.mjs plugins/linkedin-post/tests/config.test.mjs
git commit -m "feat(linkedin-post): config, token storage and secret redaction"
```

---

### Task 3: text-format.mjs (예약 문자 이스케이프)

**Files:**
- Create: `scripts/lib/text-format.mjs`
- Test: `tests/text-format.test.mjs`

**Interfaces:**
- Produces: `RESERVED_CHARS` (string), `escapeCommentary(text)` → string, `MAX_POST_LENGTH = 3000`, `countChars(text)` → number (코드 포인트 기준).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/text-format.test.mjs`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_POST_LENGTH, countChars, escapeCommentary } from "../scripts/lib/text-format.mjs";

test("escapes every LinkedIn reserved character", () => {
  const input = String.raw`a\b|c{d}e@f[g]h(i)j<k>l#m*n_o~p`;
  const expected = String.raw`a\\b\|c\{d\}e\@f\[g\]h\(i\)j\<k\>l\#m\*n\_o\~p`;
  assert.equal(escapeCommentary(input), expected);
});

test("does not double-escape characters that are already escaped", () => {
  assert.equal(escapeCommentary(String.raw`\(already\) (not)`), String.raw`\(already\) \(not\)`);
});

test("preserves Korean, emoji and line breaks", () => {
  const input = "첫 줄입니다.\n\n둘째 줄 🚀 끝";
  assert.equal(escapeCommentary(input), input);
});

test("leaves plain URLs untouched except reserved chars", () => {
  assert.equal(escapeCommentary("https://chi-hoo.com/path?a=1"), "https://chi-hoo.com/path?a=1");
});

test("countChars counts code points so emoji count as one", () => {
  assert.equal(countChars("a🚀b"), 3);
  assert.equal(MAX_POST_LENGTH, 3000);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/text-format.test.mjs`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: 구현**

`scripts/lib/text-format.mjs`:
```js
export const RESERVED_CHARS = "\\|{}@[]()<>#*_~";
export const MAX_POST_LENGTH = 3000;

const RESERVED = new Set(RESERVED_CHARS);

export function escapeCommentary(text) {
  const chars = Array.from(String(text));
  const out = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (ch === "\\" && next !== undefined && RESERVED.has(next)) {
      out.push(ch, next);
      i += 1;
      continue;
    }
    out.push(RESERVED.has(ch) ? `\\${ch}` : ch);
  }
  return out.join("");
}

export function countChars(text) {
  return Array.from(String(text)).length;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/text-format.test.mjs`
Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
git add plugins/linkedin-post/scripts/lib/text-format.mjs plugins/linkedin-post/tests/text-format.test.mjs
git commit -m "feat(linkedin-post): escape LinkedIn reserved characters"
```

---

### Task 4: linkedin-api.mjs (userinfo, posts, 에러 매핑, 네트워크 재시도)

**Files:**
- Create: `scripts/lib/linkedin-api.mjs`
- Test: `tests/linkedin-api.test.mjs`

**Interfaces:**
- Produces:
  - `API_VERSION = "202508"`, `POSTS_URL`, `USERINFO_URL`
  - `class LinkedInApiError extends Error { status, code, hint, body }` — code ∈ `UNAUTHORIZED|FORBIDDEN|BAD_REQUEST|RATE_LIMITED|SERVER_ERROR|NETWORK|UNKNOWN`
  - `mapStatusToError(status, body)` → LinkedInApiError
  - `createClient({ accessToken, fetchImpl = fetch, sleep = defaultSleep, retryDelayMs = 3000 })` → `{ getUserInfo(), createPost({ authorUrn, commentary, visibility }) }`
  - `createPost` resolves `{ id, url }`; `getUserInfo` resolves `{ sub, name }`
  - `postUrl(id)` → `https://www.linkedin.com/feed/update/${id}`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/linkedin-api.test.mjs`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  API_VERSION, LinkedInApiError, POSTS_URL, USERINFO_URL, createClient, mapStatusToError, postUrl,
} from "../scripts/lib/linkedin-api.mjs";

function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return new Response(next.body ?? null, { status: next.status, headers: next.headers ?? {} });
  };
  return { fetchImpl, calls };
}

test("getUserInfo sends bearer token and returns sub and name", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, body: JSON.stringify({ sub: "abc", name: "Tony" }) }]);
  const client = createClient({ accessToken: "tok", fetchImpl });
  assert.deepEqual(await client.getUserInfo(), { sub: "abc", name: "Tony" });
  assert.equal(calls[0].url, USERINFO_URL);
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
});

test("createPost sends the documented body and headers and returns id + url", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 201, headers: { "x-restli-id": "urn:li:share:123" } }]);
  const client = createClient({ accessToken: "tok", fetchImpl });
  const result = await client.createPost({ authorUrn: "urn:li:person:abc", commentary: "hello", visibility: "PUBLIC" });
  assert.deepEqual(result, { id: "urn:li:share:123", url: "https://www.linkedin.com/feed/update/urn:li:share:123" });
  const { url, init } = calls[0];
  assert.equal(url, POSTS_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["LinkedIn-Version"], API_VERSION);
  assert.equal(init.headers["X-Restli-Protocol-Version"], "2.0.0");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), {
    author: "urn:li:person:abc",
    commentary: "hello",
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
});

test("mapStatusToError maps statuses to codes with hints", () => {
  assert.equal(mapStatusToError(401, "").code, "UNAUTHORIZED");
  assert.equal(mapStatusToError(403, "").code, "FORBIDDEN");
  assert.equal(mapStatusToError(400, "").code, "BAD_REQUEST");
  assert.equal(mapStatusToError(422, "").code, "BAD_REQUEST");
  assert.equal(mapStatusToError(429, "").code, "RATE_LIMITED");
  assert.equal(mapStatusToError(503, "").code, "SERVER_ERROR");
  assert.equal(mapStatusToError(418, "").code, "UNKNOWN");
  assert.match(mapStatusToError(403, "").hint, /Share on LinkedIn/);
  assert.match(mapStatusToError(401, "").hint, /auth\.mjs/);
});

test("createPost throws LinkedInApiError with body on 4xx and does not retry 5xx", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 500, body: "boom" }]);
  const client = createClient({ accessToken: "tok", fetchImpl });
  await assert.rejects(
    client.createPost({ authorUrn: "u", commentary: "c", visibility: "PUBLIC" }),
    (e) => e instanceof LinkedInApiError && e.code === "SERVER_ERROR" && e.body === "boom",
  );
  assert.equal(calls.length, 1);
});

test("network failure retries once after delay, then succeeds", async () => {
  const { fetchImpl, calls } = fakeFetch([new TypeError("fetch failed"), { status: 201, headers: { "x-restli-id": "id2" } }]);
  const slept = [];
  const client = createClient({ accessToken: "tok", fetchImpl, sleep: async (ms) => slept.push(ms), retryDelayMs: 3000 });
  const result = await client.createPost({ authorUrn: "u", commentary: "c", visibility: "PUBLIC" });
  assert.equal(result.id, "id2");
  assert.equal(calls.length, 2);
  assert.deepEqual(slept, [3000]);
});

test("network failure twice surfaces NETWORK error", async () => {
  const { fetchImpl } = fakeFetch([new TypeError("fetch failed"), new TypeError("fetch failed")]);
  const client = createClient({ accessToken: "tok", fetchImpl, sleep: async () => {} });
  await assert.rejects(client.getUserInfo(), (e) => e.code === "NETWORK");
});

test("postUrl builds the feed update URL", () => {
  assert.equal(postUrl("x"), "https://www.linkedin.com/feed/update/x");
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/linkedin-api.test.mjs`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: 구현**

`scripts/lib/linkedin-api.mjs`:
```js
export const API_VERSION = "202508";
export const POSTS_URL = "https://api.linkedin.com/rest/posts";
export const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

const ERROR_TABLE = {
  UNAUTHORIZED: "Access token is invalid or expired. Run `node scripts/auth.mjs` to sign in again.",
  FORBIDDEN: "Missing permission. Make sure the 'Share on LinkedIn' product is added to your developer app, then re-run auth.",
  BAD_REQUEST: "LinkedIn rejected the post body. Check for unescaped reserved characters; the raw response is included.",
  RATE_LIMITED: "Daily posting limit reached. Try again tomorrow; the script will not retry.",
  SERVER_ERROR: "LinkedIn returned a server error. Not retried to avoid duplicate posts. Check your feed before retrying.",
  NETWORK: "Could not reach api.linkedin.com after one retry. Check your connection.",
  UNKNOWN: "Unexpected response from LinkedIn. The raw response is included.",
};

export class LinkedInApiError extends Error {
  constructor(code, status, body, message = `LinkedIn API ${code}${status ? ` (${status})` : ""}`) {
    super(message);
    this.name = "LinkedInApiError";
    this.code = code;
    this.status = status;
    this.body = body;
    this.hint = ERROR_TABLE[code];
  }
}

export function mapStatusToError(status, body) {
  const code =
    status === 401 ? "UNAUTHORIZED"
    : status === 403 ? "FORBIDDEN"
    : status === 400 || status === 422 ? "BAD_REQUEST"
    : status === 429 ? "RATE_LIMITED"
    : status >= 500 ? "SERVER_ERROR"
    : "UNKNOWN";
  return new LinkedInApiError(code, status, body);
}

export function postUrl(id) {
  return `https://www.linkedin.com/feed/update/${id}`;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient({ accessToken, fetchImpl = fetch, sleep = defaultSleep, retryDelayMs = 3000 }) {
  const baseHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  async function request(url, init) {
    try {
      return await fetchImpl(url, init);
    } catch (first) {
      await sleep(retryDelayMs);
      try {
        return await fetchImpl(url, init);
      } catch (second) {
        throw new LinkedInApiError("NETWORK", 0, String(second?.message ?? second));
      }
    }
  }

  async function getUserInfo() {
    const res = await request(USERINFO_URL, { method: "GET", headers: baseHeaders });
    if (!res.ok) throw mapStatusToError(res.status, await res.text());
    const data = await res.json();
    return { sub: data.sub, name: data.name };
  }

  async function createPost({ authorUrn, commentary, visibility }) {
    const body = {
      author: authorUrn,
      commentary,
      visibility,
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    const res = await request(POSTS_URL, {
      method: "POST",
      headers: { ...baseHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw mapStatusToError(res.status, await res.text());
    const id = res.headers.get("x-restli-id");
    if (!id) throw new LinkedInApiError("UNKNOWN", res.status, "", "Post created but x-restli-id header missing");
    return { id, url: postUrl(id) };
  }

  return { getUserInfo, createPost };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/linkedin-api.test.mjs`
Expected: 7 passing

- [ ] **Step 5: Commit**

```bash
git add plugins/linkedin-post/scripts/lib/linkedin-api.mjs plugins/linkedin-post/tests/linkedin-api.test.mjs
git commit -m "feat(linkedin-post): LinkedIn API client with error mapping and network retry"
```

---

### Task 5: oauth.mjs (인가 URL, 콜백 파싱, 코드 교환)

**Files:**
- Create: `scripts/lib/oauth.mjs`
- Test: `tests/oauth.test.mjs`

**Interfaces:**
- Produces:
  - `REDIRECT_URI = "http://localhost:8585/callback"`, `CALLBACK_PORT = 8585`, `SCOPES = "openid profile w_member_social"`, `CALLBACK_TIMEOUT_MS = 120000`
  - `class OAuthError extends Error { code: "STATE_MISMATCH"|"ACCESS_DENIED"|"MISSING_CODE"|"EXCHANGE_FAILED"|"TIMEOUT" }`
  - `generateState(randomBytesImpl?)` → 32 hex chars
  - `buildAuthorizeUrl({ clientId, state })` → string
  - `parseCallback(requestUrl, expectedState)` → `{ code }`
  - `exchangeCode({ clientId, clientSecret, code, fetchImpl = fetch, now = Date.now })` → `{ accessToken, expiresAt }`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/oauth.test.mjs`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  OAuthError, REDIRECT_URI, SCOPES, buildAuthorizeUrl, exchangeCode, generateState, parseCallback,
} from "../scripts/lib/oauth.mjs";

test("generateState returns 32 hex chars", () => {
  assert.match(generateState(), /^[0-9a-f]{32}$/);
});

test("buildAuthorizeUrl includes client_id, redirect, scope, state", () => {
  const url = new URL(buildAuthorizeUrl({ clientId: "cid", state: "st" }));
  assert.equal(url.origin + url.pathname, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("scope"), SCOPES);
  assert.equal(url.searchParams.get("state"), "st");
});

test("parseCallback returns code when state matches", () => {
  assert.deepEqual(parseCallback("/callback?code=abc&state=st", "st"), { code: "abc" });
});

test("parseCallback rejects mismatched state, denied access, missing code", () => {
  assert.throws(() => parseCallback("/callback?code=abc&state=other", "st"), (e) => e instanceof OAuthError && e.code === "STATE_MISMATCH");
  assert.throws(() => parseCallback("/callback?error=user_cancelled_login&state=st", "st"), (e) => e.code === "ACCESS_DENIED");
  assert.throws(() => parseCallback("/callback?state=st", "st"), (e) => e.code === "MISSING_CODE");
});

test("exchangeCode posts form body and computes expiresAt", async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ access_token: "tok", expires_in: 5184000 }), { status: 200 });
  };
  const now = () => 1_000_000;
  const result = await exchangeCode({ clientId: "cid", clientSecret: "sec", code: "abc", fetchImpl, now });
  assert.deepEqual(result, { accessToken: "tok", expiresAt: 1_000_000 + 5184000 * 1000 });
  assert.equal(captured.url, "https://www.linkedin.com/oauth/v2/accessToken");
  assert.equal(captured.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const params = new URLSearchParams(captured.init.body);
  assert.equal(params.get("grant_type"), "authorization_code");
  assert.equal(params.get("code"), "abc");
  assert.equal(params.get("client_id"), "cid");
  assert.equal(params.get("client_secret"), "sec");
  assert.equal(params.get("redirect_uri"), REDIRECT_URI);
});

test("exchangeCode throws EXCHANGE_FAILED on non-200 without leaking the secret", async () => {
  const fetchImpl = async () => new Response("invalid_client sec", { status: 400 });
  await assert.rejects(
    exchangeCode({ clientId: "cid", clientSecret: "sec", code: "abc", fetchImpl }),
    (e) => e.code === "EXCHANGE_FAILED" && !e.message.includes("sec"),
  );
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/oauth.test.mjs`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: 구현**

`scripts/lib/oauth.mjs`:
```js
import { randomBytes } from "node:crypto";
import { redact } from "./redact.mjs";

export const CALLBACK_PORT = 8585;
export const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
export const SCOPES = "openid profile w_member_social";
export const CALLBACK_TIMEOUT_MS = 120_000;

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

export class OAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
  }
}

export function generateState(randomBytesImpl = randomBytes) {
  return randomBytesImpl(16).toString("hex");
}

export function buildAuthorizeUrl({ clientId, state }) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export function parseCallback(requestUrl, expectedState) {
  const url = new URL(requestUrl, "http://localhost");
  const params = url.searchParams;
  if (params.get("state") !== expectedState) {
    throw new OAuthError("STATE_MISMATCH", "OAuth state did not match. Possible CSRF or stale login window.");
  }
  if (params.get("error")) {
    throw new OAuthError("ACCESS_DENIED", `LinkedIn returned error: ${params.get("error")}`);
  }
  const code = params.get("code");
  if (!code) throw new OAuthError("MISSING_CODE", "Callback did not include an authorization code.");
  return { code };
}

export async function exchangeCode({ clientId, clientSecret, code, fetchImpl = fetch, now = Date.now }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new OAuthError("EXCHANGE_FAILED", `Token exchange failed (${res.status}): ${redact(text, [clientSecret])}`);
  }
  const data = JSON.parse(text);
  return { accessToken: data.access_token, expiresAt: now() + data.expires_in * 1000 };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/oauth.test.mjs`
Expected: 6 passing

- [ ] **Step 5: Commit**

```bash
git add plugins/linkedin-post/scripts/lib/oauth.mjs plugins/linkedin-post/tests/oauth.test.mjs
git commit -m "feat(linkedin-post): OAuth helpers for authorize URL, callback and token exchange"
```

---

### Task 6: publish.mjs (발행 CLI)

**Files:**
- Create: `scripts/publish.mjs`
- Test: `tests/publish.test.mjs`

**Interfaces:**
- Consumes: `config.mjs` (getHome, loadToken, tokenStatus, ConfigError), `text-format.mjs` (escapeCommentary, countChars, MAX_POST_LENGTH), `linkedin-api.mjs` (createClient, LinkedInApiError), `redact.mjs`.
- Produces:
  - `parseArgs(argv)` → `{ file, visibility: "PUBLIC"|"CONNECTIONS", dryRun: boolean }`; 잘못된 인자면 `PublishError("BAD_ARGS")`
  - `class PublishError extends Error { code: "BAD_ARGS"|"FILE_NOT_FOUND"|"EMPTY_BODY"|"TOO_LONG"; hint }`
  - `validateBody(text)` → trimmed text
  - `runPublish(argv, deps)` → `Promise<number>` (exit code). deps: `{ env, fetchImpl, now, sleep, stdout(line), stderr(line) }`
  - stdout JSON 성공: `{"ok":true,"url","id","chars"}`; dry-run: `{"ok":true,"dryRun":true,"request":{...},"chars"}`; 실패: `{"ok":false,"code","message","hint"}`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/publish.test.mjs`:
```js
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { saveToken } from "../scripts/lib/config.mjs";
import { PublishError, parseArgs, runPublish, validateBody } from "../scripts/publish.mjs";
import { makeTempHome } from "./helpers.mjs";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function setup({ token = { accessToken: "tok", expiresAt: NOW + 30 * DAY, personUrn: "urn:li:person:abc", name: "Tony" }, body = "안녕하세요 (테스트)" } = {}) {
  const { home, cleanup } = makeTempHome();
  if (token) saveToken(home, token);
  const file = join(home, "draft.md");
  writeFileSync(file, body);
  const out = [];
  const err = [];
  const deps = {
    env: { LINKEDIN_POST_HOME: home },
    now: () => NOW,
    sleep: async () => {},
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  };
  return { home, file, out, err, deps, cleanup, lastJson: () => JSON.parse(out.at(-1)) };
}

test("parseArgs reads file, visibility and dry-run", () => {
  assert.deepEqual(parseArgs(["a.md"]), { file: "a.md", visibility: "PUBLIC", dryRun: false });
  assert.deepEqual(parseArgs(["a.md", "--visibility", "connections", "--dry-run"]), { file: "a.md", visibility: "CONNECTIONS", dryRun: true });
  assert.throws(() => parseArgs([]), (e) => e instanceof PublishError && e.code === "BAD_ARGS");
  assert.throws(() => parseArgs(["a.md", "--visibility", "everyone"]), (e) => e.code === "BAD_ARGS");
});

test("validateBody rejects empty and over-long text", () => {
  assert.throws(() => validateBody("  \n "), (e) => e.code === "EMPTY_BODY");
  assert.throws(() => validateBody("가".repeat(3001)), (e) => e.code === "TOO_LONG");
  assert.equal(validateBody("  hi  "), "hi");
});

test("missing file exits 2 with FILE_NOT_FOUND", async () => {
  const s = setup();
  try {
    const code = await runPublish([join(s.home, "nope.md")], s.deps);
    assert.equal(code, 2);
    assert.equal(s.lastJson().code, "FILE_NOT_FOUND");
  } finally { s.cleanup(); }
});

test("missing token exits 2 with MISSING_TOKEN hint", async () => {
  const s = setup({ token: null });
  try {
    const code = await runPublish([s.file], s.deps);
    assert.equal(code, 2);
    assert.equal(s.lastJson().code, "MISSING_TOKEN");
    assert.match(s.lastJson().hint, /auth\.mjs/);
  } finally { s.cleanup(); }
});

test("expired token exits 2 with TOKEN_EXPIRED", async () => {
  const s = setup({ token: { accessToken: "tok", expiresAt: NOW - 1, personUrn: "urn:li:person:abc", name: "Tony" } });
  try {
    const code = await runPublish([s.file], s.deps);
    assert.equal(code, 2);
    assert.equal(s.lastJson().code, "TOKEN_EXPIRED");
  } finally { s.cleanup(); }
});

test("dry-run prints escaped request without calling fetch", async () => {
  const s = setup();
  let called = 0;
  s.deps.fetchImpl = async () => { called += 1; };
  try {
    const code = await runPublish([s.file, "--dry-run"], s.deps);
    assert.equal(code, 0);
    assert.equal(called, 0);
    const json = s.lastJson();
    assert.equal(json.dryRun, true);
    assert.equal(json.request.commentary, "안녕하세요 \\(테스트\\)");
    assert.equal(json.request.author, "urn:li:person:abc");
    assert.equal(json.chars, 11);
  } finally { s.cleanup(); }
});

test("successful publish prints url and exits 0; expiring token warns on stderr", async () => {
  const s = setup({ token: { accessToken: "tok", expiresAt: NOW + 2 * DAY, personUrn: "urn:li:person:abc", name: "Tony" } });
  s.deps.fetchImpl = async () => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:9" } });
  try {
    const code = await runPublish([s.file], s.deps);
    assert.equal(code, 0);
    assert.deepEqual(s.lastJson(), { ok: true, id: "urn:li:share:9", url: "https://www.linkedin.com/feed/update/urn:li:share:9", chars: 11 });
    assert.ok(s.err.some((l) => /expires in 2 day/.test(l)));
  } finally { s.cleanup(); }
});

test("API failure exits 1 with mapped code and never prints the token", async () => {
  const s = setup();
  s.deps.fetchImpl = async () => new Response("bad tok", { status: 400 });
  try {
    const code = await runPublish([s.file], s.deps);
    assert.equal(code, 1);
    const json = s.lastJson();
    assert.equal(json.ok, false);
    assert.equal(json.code, "BAD_REQUEST");
    assert.ok(!JSON.stringify(json).includes("tok"), "token leaked");
  } finally { s.cleanup(); }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/publish.test.mjs`
Expected: FAIL (Cannot find module publish.mjs)

- [ ] **Step 3: 구현**

`scripts/publish.mjs`:
```js
#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ConfigError, getHome, loadToken, tokenStatus } from "./lib/config.mjs";
import { LinkedInApiError, createClient } from "./lib/linkedin-api.mjs";
import { redact } from "./lib/redact.mjs";
import { MAX_POST_LENGTH, countChars, escapeCommentary } from "./lib/text-format.mjs";

const VISIBILITIES = { public: "PUBLIC", connections: "CONNECTIONS" };
const DAY_MS = 24 * 60 * 60 * 1000;

const HINTS = {
  BAD_ARGS: "Usage: node scripts/publish.mjs <body-file> [--visibility public|connections] [--dry-run]",
  FILE_NOT_FOUND: "Check the draft path passed to publish.mjs.",
  EMPTY_BODY: "The draft file is empty. Write the post before publishing.",
  TOO_LONG: `LinkedIn posts are limited to ${MAX_POST_LENGTH} characters. Shorten the draft.`,
  TOKEN_EXPIRED: "Your LinkedIn token has expired. Run `node scripts/auth.mjs` to sign in again.",
};

export class PublishError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublishError";
    this.code = code;
    this.hint = HINTS[code];
  }
}

export function parseArgs(argv) {
  const positional = [];
  let visibility = "PUBLIC";
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--visibility") {
      const value = VISIBILITIES[String(argv[i + 1]).toLowerCase()];
      if (!value) throw new PublishError("BAD_ARGS", `Unknown visibility: ${argv[i + 1]}`);
      visibility = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new PublishError("BAD_ARGS", `Unknown flag: ${arg}`);
    positional.push(arg);
  }
  if (positional.length !== 1) throw new PublishError("BAD_ARGS", "Exactly one body file is required.");
  return { file: positional[0], visibility, dryRun };
}

export function validateBody(text) {
  const trimmed = String(text).trim();
  if (!trimmed) throw new PublishError("EMPTY_BODY", "Body is empty.");
  const chars = countChars(trimmed);
  if (chars > MAX_POST_LENGTH) throw new PublishError("TOO_LONG", `Body has ${chars} characters.`);
  return trimmed;
}

function readBody(file) {
  if (!existsSync(file)) throw new PublishError("FILE_NOT_FOUND", `${file} does not exist.`);
  return validateBody(readFileSync(file, "utf8"));
}

function loadValidToken(home, now, stderr) {
  const token = loadToken(home);
  const status = tokenStatus(token, now());
  if (status === "expired") throw new PublishError("TOKEN_EXPIRED", "Token expired.");
  if (status === "expiring") {
    const days = Math.max(1, Math.ceil((token.expiresAt - now()) / DAY_MS));
    stderr(`warning: LinkedIn token expires in ${days} day(s). Run \`node scripts/auth.mjs\` soon.`);
  }
  return token;
}

function failure(error, secrets) {
  const code = error.code ?? "UNKNOWN";
  const payload = {
    ok: false,
    code,
    message: redact(error.message, secrets),
    hint: error.hint ?? "",
  };
  if (error instanceof LinkedInApiError && error.body) payload.response = redact(error.body, secrets);
  return payload;
}

export async function runPublish(argv, deps = {}) {
  const {
    env = process.env,
    fetchImpl = fetch,
    now = Date.now,
    sleep,
    stdout = (line) => process.stdout.write(`${line}\n`),
    stderr = (line) => process.stderr.write(`${line}\n`),
  } = deps;
  const secrets = [];
  try {
    const args = parseArgs(argv);
    const body = readBody(args.file);
    const token = loadValidToken(getHome(env), now, stderr);
    secrets.push(token.accessToken);
    const commentary = escapeCommentary(body);
    const request = { author: token.personUrn, commentary, visibility: args.visibility };
    const chars = countChars(body);

    if (args.dryRun) {
      stdout(JSON.stringify({ ok: true, dryRun: true, request, chars }));
      return 0;
    }

    const client = createClient({ accessToken: token.accessToken, fetchImpl, sleep });
    const { id, url } = await client.createPost({ authorUrn: token.personUrn, commentary, visibility: args.visibility });
    stdout(JSON.stringify({ ok: true, id, url, chars }));
    return 0;
  } catch (error) {
    stdout(JSON.stringify(failure(error, secrets)));
    if (error instanceof LinkedInApiError) return 1;
    if (error instanceof PublishError || error instanceof ConfigError) return 2;
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPublish(process.argv.slice(2)).then((code) => process.exit(code));
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/publish.test.mjs`
Expected: 8 passing. 이어서 `npm test`로 전체 통과 확인.

- [ ] **Step 5: Commit**

```bash
git add plugins/linkedin-post/scripts/publish.mjs plugins/linkedin-post/tests/publish.test.mjs
git commit -m "feat(linkedin-post): publish CLI with validation, dry-run and JSON output"
```

---

### Task 7: auth.mjs (브라우저 OAuth 로그인 CLI)

**Files:**
- Create: `scripts/auth.mjs`

**Interfaces:**
- Consumes: `config.mjs` (getHome, loadConfig, saveToken, ConfigError), `oauth.mjs` (전체), `linkedin-api.mjs` (createClient).
- Produces: CLI만. stdout JSON 성공 `{"ok":true,"name","personUrn","expiresAt"}`, 실패 `{"ok":false,"code","message","hint"}`. 종료 코드 0/1/2.
- 브라우저 흐름은 자동 테스트하지 않는다(수동 검증, Task 11).

- [ ] **Step 1: 구현**

`scripts/auth.mjs`:
```js
#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { ConfigError, getHome, loadConfig, saveToken } from "./lib/config.mjs";
import { createClient } from "./lib/linkedin-api.mjs";
import {
  CALLBACK_PORT, CALLBACK_TIMEOUT_MS, OAuthError, buildAuthorizeUrl, exchangeCode, generateState, parseCallback,
} from "./lib/oauth.mjs";
import { redact } from "./lib/redact.mjs";

const SUCCESS_HTML = "<html><body style='font-family:sans-serif;padding:2rem'><h2>Signed in.</h2><p>You can close this tab and return to the terminal.</p></body></html>";
const FAILURE_HTML = (msg) => `<html><body style='font-family:sans-serif;padding:2rem'><h2>Sign-in failed</h2><p>${msg}</p></body></html>`;

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    process.stderr.write(`Open this URL in your browser:\n${url}\n`);
  }
}

function waitForCallback(state) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url.startsWith("/callback")) { res.writeHead(404).end(); return; }
      try {
        const { code } = parseCallback(req.url, state);
        res.writeHead(200, { "Content-Type": "text/html" }).end(SUCCESS_HTML);
        finish(() => resolve(code));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "text/html" }).end(FAILURE_HTML(error.message));
        finish(() => reject(error));
      }
    });
    const timer = setTimeout(() => finish(() => reject(new OAuthError("TIMEOUT", "No login callback within 120 seconds."))), CALLBACK_TIMEOUT_MS);
    function finish(done) { clearTimeout(timer); server.close(); done(); }
    server.on("error", (error) => finish(() => reject(new OAuthError("TIMEOUT", `Could not listen on port ${CALLBACK_PORT}: ${error.message}`))));
    server.listen(CALLBACK_PORT, "127.0.0.1");
  });
}

export async function runAuth(deps = {}) {
  const { env = process.env, fetchImpl = fetch, stdout = (l) => process.stdout.write(`${l}\n`), stderr = (l) => process.stderr.write(`${l}\n`) } = deps;
  const secrets = [];
  try {
    const home = getHome(env);
    const { clientId, clientSecret } = loadConfig(home);
    secrets.push(clientSecret);
    const state = generateState();
    const url = buildAuthorizeUrl({ clientId, state });
    stderr("Opening LinkedIn sign-in in your browser...");
    openBrowser(url);
    const code = await waitForCallback(state);
    const { accessToken, expiresAt } = await exchangeCode({ clientId, clientSecret, code, fetchImpl });
    secrets.push(accessToken);
    const { sub, name } = await createClient({ accessToken, fetchImpl }).getUserInfo();
    const token = { accessToken, expiresAt, personUrn: `urn:li:person:${sub}`, name };
    saveToken(home, token);
    stdout(JSON.stringify({ ok: true, name, personUrn: token.personUrn, expiresAt }));
    return 0;
  } catch (error) {
    stdout(JSON.stringify({ ok: false, code: error.code ?? "UNKNOWN", message: redact(error.message, secrets), hint: error.hint ?? "" }));
    return error instanceof ConfigError ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAuth().then((code) => process.exit(code));
}
```

- [ ] **Step 2: 문법·임포트 검증**

Run: `node --check scripts/auth.mjs && LINKEDIN_POST_HOME=$(mktemp -d) node scripts/auth.mjs; echo "exit=$?"`
Expected: stdout `{"ok":false,"code":"MISSING_CONFIG",...}`, `exit=2`. 브라우저는 열리지 않아야 한다.

- [ ] **Step 3: Commit**

```bash
git add plugins/linkedin-post/scripts/auth.mjs
git commit -m "feat(linkedin-post): browser OAuth sign-in CLI"
```

---

### Task 8: 스타일 가이드와 글 유형 템플릿

**Files:**
- Create: `skills/linkedin-post/references/style-guide.md`
- Create: `skills/linkedin-post/references/post-types.md`

**Interfaces:**
- Produces: SKILL.md(Task 9)가 읽는 두 참조 문서. post-types의 유형 키 `ai-tools`, `philosophy`, `side-project`, `pm-insight`는 published frontmatter의 `type` 값으로도 쓰인다.

- [ ] **Step 1: style-guide.md 작성**

```markdown
# LinkedIn Post Style Guide

General principles for any author. Personal preferences live in `~/.linkedin-post/my-style.md` and override this file when they conflict.

## Structure
- The first two lines decide whether anyone taps "see more". Open with the conclusion, a concrete scene, or one sentence of tension. Never open with "Today I want to share".
- Paragraphs are one to three sentences with a blank line between them. Optimize for a phone screen.
- Order: experience, then observation, then generalization. A post that is only abstract claims is not ready.
- Include at least one concrete anchor: a number, a proper noun, a specific situation, a quoted line.
- End with a question or a single next action. One line.
- Hashtags: three to five, on their own line at the very end, separated from the body by a blank line.
- Target length 800 to 1500 characters. Hard limit 3000.

## Voice
- Default language is Korean in polite form (존댓말, ~습니다/~해요). Switch to English only when asked.
- First person, plain words, no marketing adjectives. Say what happened and what it meant.
- Emoji: at most three, used only as paragraph markers at the start of a line, never inside a sentence.
- No em dashes. No bullet lists longer than four items. No headers inside the post.
- Do not name clients, coworkers, or companies without the author's explicit go-ahead. Default to "a client" or "a teammate".

## Before showing a draft, check
- Do the first two lines stand alone?
- Is there one concrete anchor?
- Does the ending give the reader something to do or answer?
- Character count and hashtag count reported next to the draft.
```

- [ ] **Step 2: post-types.md 작성**

```markdown
# Post Types

Pick one type per post. Use the key in the published file's frontmatter (`type:`).

## ai-tools
Practical insight about AI and developer tooling (Claude Code, automation, productivity).
Skeleton: the problem in one scene → the tool or method tried → the measurable result → one reproducible tip the reader can apply today.
Anchor: a number (time saved, steps removed, lines of code) or an exact command/feature name.

## philosophy
Essay connecting a philosophy concept to work or technology. The author studied philosophy; lean on that without lecturing.
Skeleton: an everyday scene → the concept it evokes, named once and explained in one sentence → how it reframes a work or tech situation → an open question.
Anchor: the concept name plus one thinker, at most one quotation.

## side-project
Building log from a side project (for example a small e-commerce site, a hardware experiment).
Skeleton: what was built or shipped → one thing learned → a failure or a number, honestly → the next step.
Anchor: a number (users, orders, hours, iterations) or a specific bug.

## pm-insight
Insight from project or program management practice.
Skeleton: the situation on the ground → the judgment call and its reasoning → what happened → one line another PM can take away.
Anchor: a decision, a trade-off, or a metric that moved.

## Choosing
- Input mentions a tool, prompt, or workflow → ai-tools.
- Input mentions a concept, thinker, or "why do we" → philosophy.
- Input is a build log, launch, or retro of the author's own product → side-project.
- Input is about stakeholders, scope, schedule, or team decisions → pm-insight.
- If two fit, ask the author which one, offering the two options.
```

- [ ] **Step 3: 파일 존재 확인**

Run: `ls skills/linkedin-post/references/`
Expected: `post-types.md  style-guide.md`

- [ ] **Step 4: Commit**

```bash
git add plugins/linkedin-post/skills/linkedin-post/references
git commit -m "docs(linkedin-post): style guide and post type templates"
```

---

### Task 9: SKILL.md (대화 흐름) 와 스킬 계약 테스트

**Files:**
- Create: `skills/linkedin-post/SKILL.md`
- Modify: `tests/plugin-package.test.mjs` (테스트 추가)

**Interfaces:**
- Consumes: `scripts/publish.mjs` CLI 계약 (`node scripts/publish.mjs <file> [--visibility] [--dry-run]`, stdout JSON), `scripts/auth.mjs`, references 두 파일, `~/.linkedin-post/` 레이아웃.
- Produces: 사용자 진입점 `/linkedin-post`.

- [ ] **Step 1: 실패하는 스킬 계약 테스트 추가**

`tests/plugin-package.test.mjs` 끝에 추가:
```js
import { readText } from "./helpers.mjs";

test("SKILL.md has frontmatter and references the scripts and reference docs", () => {
  const skill = readText("skills/linkedin-post/SKILL.md");
  assert.match(skill, /^---\nname: linkedin-post\ndescription: .+\n---\n/);
  for (const needle of [
    "references/style-guide.md",
    "references/post-types.md",
    "scripts/publish.mjs",
    "scripts/auth.mjs",
    "--dry-run",
    "LINKEDIN_POST_HOME",
    "published/",
    "drafts/",
    "my-style.md",
  ]) assert.ok(skill.includes(needle), `SKILL.md missing ${needle}`);
});

test("SKILL.md forbids publishing without explicit confirmation", () => {
  const skill = readText("skills/linkedin-post/SKILL.md");
  assert.match(skill, /Never publish without/i);
});

test("reference docs exist and define the four post types", () => {
  const types = readText("skills/linkedin-post/references/post-types.md");
  for (const key of ["ai-tools", "philosophy", "side-project", "pm-insight"]) assert.ok(types.includes(`## ${key}`));
  assert.ok(readText("skills/linkedin-post/references/style-guide.md").includes("3000"));
});
```

(파일 상단 import 문에 `readText`를 기존 `import { pluginRoot, readJson, repoRoot } from "./helpers.mjs";`에 합쳐 하나의 import로 정리한다.)

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/plugin-package.test.mjs`
Expected: SKILL.md 관련 2개 FAIL (ENOENT), reference 테스트 PASS

- [ ] **Step 3: SKILL.md 작성**

`skills/linkedin-post/SKILL.md`:
````markdown
---
name: linkedin-post
description: Draft a LinkedIn post from a one-line topic or a source file, refine it in conversation, and publish it to the user's personal LinkedIn profile through the official API once they explicitly confirm. Use when the user types /linkedin-post, asks to write or publish a LinkedIn post, or wants to turn notes, a blog post, or a retro into a LinkedIn update.
---

# LinkedIn Post

Write the post; let the scripts talk to LinkedIn. You never call the LinkedIn API yourself and never print tokens or secrets.

All paths below are relative to this plugin's root (the directory containing `scripts/` and `skills/`). Resolve it from this file's location: `skills/linkedin-post/SKILL.md` → plugin root is two directories up.

## Personal data location

`LINKEDIN_POST_HOME` env var if set, otherwise `~/.linkedin-post/`:

- `config.json` – LinkedIn app client id/secret
- `token.json` – access token (managed by `scripts/auth.mjs`)
- `references/` – other people's posts the user likes (markdown)
- `drafts/` – confirmed body waiting to be published
- `published/` – copies of published posts, `YYYY-MM-DD-<slug>.md`
- `my-style.md` – the user's own style rules, appended only on request

## 0. First run

If `config.json` is missing:
1. Explain in two or three sentences that LinkedIn requires a free developer app, then give these steps:
   - Go to https://www.linkedin.com/developers/apps and create an app (any name; a LinkedIn Page to associate is required by LinkedIn, the user's own page or a placeholder page works).
   - In the **Products** tab add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
   - In the **Auth** tab add redirect URL `http://localhost:8585/callback` and copy the Client ID and Primary Client Secret.
2. Ask for the Client ID and Client Secret. Write them to `config.json` as `{"client_id": "...", "client_secret": "..."}` and create `references/`, `drafts/`, `published/`. Do not echo the secret back.

If `token.json` is missing or `publish.mjs --dry-run` reports `MISSING_TOKEN`/`TOKEN_EXPIRED`:
- Run `node scripts/auth.mjs` from the plugin root. It opens the browser; tell the user to sign in there. Report only the `name` from the JSON result.

## 1. Load context

Read, in this order:
1. `references/style-guide.md` and `references/post-types.md` (this skill's folder).
2. `my-style.md` if it exists. Its rules override the style guide.
3. Every file in `references/` (user's saved example posts), up to 10.
4. The 5 most recent files in `published/`.

Parse the invocation:
- `/linkedin-post <text>` – if `<text>` is an existing file path, read it as source material; otherwise treat it as the topic.
- `--en` anywhere in the arguments → write in English. Default is Korean, polite form.
- `--visibility connections` → pass through to publish. Default public.
- No arguments → ask one question: "What is the post about? A topic line or a file path works."

If the topic is a single line, ask at most two questions before drafting: the one concrete experience behind it, and whether there is a number or specific example to include. If the user gives a file, do not ask; draft from it.

## 2. Draft

1. Pick a post type using the "Choosing" rules in `post-types.md`. If two fit, ask which.
2. Write the post following the type skeleton and the style guide. Mirror the tone of `my-style.md` and `references/` when present.
3. Show the draft in a fenced block, then directly below it:
   - `Type:` the post type
   - `Chars:` character count (code points) and the 3000 limit
   - `Preview:` the first two lines as they will appear before "see more"
   - `Hashtags:` count
4. Iterate on feedback in conversation. Do not run any script in this phase.
5. If the user gives a style remark that should persist ("shorter openings", "no emoji"), ask "Save this to my-style.md?" and append one line only if they say yes.
6. If the user pastes someone else's post as a reference, save it to `references/<YYYY-MM-DD>-<slug>.md` and say so.

## 3. Confirm and publish

Never publish without an explicit confirmation such as "올려", "발행", "게시", "publish", "post it". A positive remark about the draft is not confirmation. When in doubt, ask "Publish this to LinkedIn now?".

On confirmation:
1. Write the final body (exactly what was shown, hashtags included) to `drafts/<unix-timestamp>-<slug>.md`. The slug is 3–6 lowercase ASCII words from the topic joined by `-`.
2. Run from the plugin root:
   `node scripts/publish.mjs "<draft path>" [--visibility connections]`
   Parse the single JSON line on stdout.
3. If `ok` is true:
   - Move the draft to `published/<YYYY-MM-DD>-<slug>.md` and prepend frontmatter:
     ```
     ---
     date: <YYYY-MM-DD>
     url: <url>
     type: <post type>
     lang: ko | en
     ---
     ```
   - Reply with the URL and the character count. Nothing else is required.
4. If `ok` is false:
   - Leave the draft in `drafts/`.
   - Show `code`, `message`, and `hint` to the user in plain language. For `MISSING_TOKEN`/`TOKEN_EXPIRED`/`UNAUTHORIZED`, offer to run `node scripts/auth.mjs` and then retry the same draft file. For `SERVER_ERROR`, tell the user to check their feed before retrying because the post may have gone through.
   - Never rerun publish automatically.

Use `node scripts/publish.mjs "<draft path>" --dry-run` when you need to check the token or the escaped body without posting.

## Rules

- Never paste `client_secret` or `access_token` into the conversation, even partially.
- Never modify `token.json` or `config.json` except as described in section 0.
- Never publish images, schedule posts, or post to company pages. Say those are out of scope if asked.
- Keep the draft you show and the body you publish identical.
````

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/linkedin-post/skills/linkedin-post/SKILL.md plugins/linkedin-post/tests/plugin-package.test.mjs
git commit -m "feat(linkedin-post): SKILL.md conversation flow and skill contract tests"
```

---

### Task 10: README 두 개와 플러그인 validate

**Files:**
- Create: `README.md` (플러그인)
- Create: `<repo>/README.md` (카탈로그)

**Interfaces:**
- Consumes: 설치 명령 규약 `/plugin marketplace add ej-rarus/work-with-tony`, `/plugin install linkedin-post@work-with-tony`.

- [ ] **Step 1: 플러그인 README 작성**

`README.md`:
````markdown
# linkedin-post

Draft LinkedIn posts in a Claude Code conversation and publish them to your personal profile through the official LinkedIn API. Text posts only, published immediately, always after your explicit confirmation.

## Install

```
/plugin marketplace add ej-rarus/work-with-tony
/plugin install linkedin-post@work-with-tony
```

Requires Node 20 or newer. No npm dependencies.

## One-time setup: LinkedIn developer app

LinkedIn only lets you post through an app you own. It takes about five minutes and is free.

1. Open https://www.linkedin.com/developers/apps and click **Create app**. Any name works. LinkedIn asks you to associate a LinkedIn Page; use your own page or create a placeholder page.
2. **Products** tab: add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**. Both are self-serve and approved instantly.
3. **Auth** tab: under *Authorized redirect URLs* add `http://localhost:8585/callback`. Copy the **Client ID** and **Primary Client Secret**.
4. Run `/linkedin-post` in Claude Code. The skill asks for the two values and writes them to `~/.linkedin-post/config.json`, then runs the sign-in script which opens your browser.

Tokens last 60 days. When one is about to expire the publish step warns you; when it has expired the skill offers to run sign-in again.

## Usage

```
/linkedin-post 이번 주 Claude Code 스킬 만들면서 배운 점
/linkedin-post ~/notes/retro.md
/linkedin-post --en What I learned shipping a side project in a weekend
/linkedin-post --visibility connections 팀에만 공유할 이야기
```

The skill drafts, shows character count and the two-line preview, iterates with you, and publishes only when you say so (for example "올려" or "publish").

## Files it keeps

All under `~/.linkedin-post/` (override with `LINKEDIN_POST_HOME`):

| Path | What |
|---|---|
| `config.json` | Client ID and secret |
| `token.json` | Access token, mode 0600 |
| `references/` | Example posts you like |
| `drafts/` | Confirmed body awaiting publish |
| `published/` | Copy of each published post with date, URL, type |
| `my-style.md` | Your own style rules, appended only when you ask |

Nothing personal is stored inside the plugin directory.

## Scripts

```
node scripts/auth.mjs                       # browser sign-in, saves token.json
node scripts/publish.mjs body.md            # publish, prints one JSON line
node scripts/publish.mjs body.md --dry-run  # show escaped request, no API call
```

Exit codes: 0 success, 1 LinkedIn API error, 2 configuration or validation error.

## Out of scope (for now)

Images and documents, scheduled posts, company pages, editing or deleting posts, analytics.

## Development

```
npm test
claude plugin validate . --strict
claude --plugin-dir .    # try the skill in a session
```
````

- [ ] **Step 2: 카탈로그 README 작성**

`<repo>/README.md`:
```markdown
# work-with-tony

Personal Claude Code plugin catalog by Tony (Eunjae Lee).

```
/plugin marketplace add ej-rarus/work-with-tony
```

| Plugin | What it does | Install |
|---|---|---|
| [linkedin-post](plugins/linkedin-post/) | Draft LinkedIn posts in conversation and publish to your profile via the official API | `/plugin install linkedin-post@work-with-tony` |

Each plugin lives under `plugins/<name>/` with its own README, tests and manifest.
```

- [ ] **Step 3: 플러그인 검증 실행**

Run: `cd ~/Documents/work-with-tony/plugins/linkedin-post && npm test && claude plugin validate . --strict`
Expected: 테스트 전체 PASS, validate 경고 0. 경고가 나오면 manifest 필드를 고쳐 다시 통과시킨다.

- [ ] **Step 4: Commit**

```bash
git add README.md plugins/linkedin-post/README.md
git commit -m "docs: catalog and linkedin-post README with setup guide"
```

---

### Task 11: 실사용 검증 (수동)

**Files:** 없음 (검증만). 이 태스크는 사용자 본인이 브라우저 로그인을 해야 하므로 메인 세션에서 사용자와 함께 진행한다. 서브에이전트에 위임하지 않는다.

- [ ] **Step 1: 개발자 앱 준비 확인**

사용자에게 README의 "One-time setup" 1~3단계를 마쳤는지 확인하고, Client ID/Secret을 받아 `~/.linkedin-post/config.json`에 저장한다. 값은 대화에 다시 출력하지 않는다.

- [ ] **Step 2: 로그인**

Run: `cd ~/Documents/work-with-tony/plugins/linkedin-post && node scripts/auth.mjs`
Expected: 브라우저가 열리고 로그인 후 `{"ok":true,"name":"...","personUrn":"urn:li:person:...","expiresAt":...}`. `ls -l ~/.linkedin-post/token.json` 권한이 `-rw-------`.

- [ ] **Step 3: dry-run**

```bash
printf '테스트 (dry run) #tag' > ~/.linkedin-post/drafts/test.md
node scripts/publish.mjs ~/.linkedin-post/drafts/test.md --dry-run
```
Expected: `commentary`가 `테스트 \(dry run\) \#tag`, `author`가 본인 URN.

- [ ] **Step 4: 스킬로 첫 글 실제 발행**

`claude --plugin-dir ~/Documents/work-with-tony/plugins/linkedin-post` 세션에서 `/linkedin-post <실제 주제>`를 실행해 초안 → 확정 → 발행까지 진행한다. 반환된 URL을 브라우저에서 열어 글이 보이는지, `published/`에 frontmatter 포함 파일이 생겼는지, `drafts/`가 비었는지 확인한다.

- [ ] **Step 5: 결과 기록**

실발행에서 발견된 문제(이스케이프 깨짐, 헤더 버전 거부 등)는 해당 lib 테스트에 케이스를 추가하고 고친 뒤 커밋한다. 문제가 없으면 이 태스크는 커밋 없이 종료한다.

---

## Self-Review

**Spec coverage**
- §2 범위: 텍스트 즉시 발행(T6), 주제/파일 입력(T9), 한/영(T9), 스타일 축적(T8, T9), OAuth(T5, T7), 최초 설정 안내(T9, T10). 제외 항목은 SKILL.md Rules와 README에 명시(T9, T10).
- §3 레포 구조: T1(매니페스트), T2~T7(scripts), T8~T9(skills), T10(README). 개인 데이터 레이아웃은 config.mjs `getPaths`(T2).
- §5 흐름: 진입·컨텍스트·초안·확정·실패 처리·스타일 축적 모두 SKILL.md(T9).
- §6 스크립트: 사전 검증·토큰 상태·이스케이프·헤더·본문·URL·JSON 출력(T6), 에러 매핑 표·네트워크 1회 재시도·5xx 비재시도(T4), state·타임아웃·0600(T5, T7, T2), 마스킹(T2 redact, T6·T7 failure 경로).
- §8 테스트: text-format, config, linkedin-api, publish, plugin-package 모두 존재. oauth 테스트 추가. auth 브라우저 흐름 수동(T11).
- §9 마켓플레이스: marketplace.json(T1), 설치 명령(T10).

**Type consistency**
- `loadToken` 반환 `{accessToken, expiresAt, personUrn, name}`은 T6/T7에서 같은 필드명으로 사용.
- `createClient({accessToken, fetchImpl, sleep, retryDelayMs})`, `createPost({authorUrn, commentary, visibility})` 시그니처가 T4 정의와 T6 호출에서 일치.
- `parseCallback(requestUrl, expectedState)`, `exchangeCode({clientId, clientSecret, code, fetchImpl, now})`가 T5 정의와 T7 호출에서 일치.
- post type 키 4개가 T8 문서, T9 SKILL.md, T9 테스트에서 동일.

**Placeholder scan**: TBD/TODO 없음. 모든 코드 단계에 실제 코드 포함.
