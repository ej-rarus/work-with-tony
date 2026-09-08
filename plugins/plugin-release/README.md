# plugin-release

Validate Claude Code and Codex plugin packages, keep their local marketplace registrations in sync, and carry an authorized release through to a verified Git push. The same skill runs in both hosts.

The bundled CLI checks files and runs requested validation. It previews metadata changes by default and only writes them with `--write`. The host skill reviews the changes and handles Git operations according to the user's request.

## Install

Claude Code:

```text
/plugin marketplace add ej-rarus/work-with-tony
/plugin install plugin-release@work-with-tony
```

Codex:

```text
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add plugin-release@work-with-tony
```

Start a new Claude Code session or Codex task after installation to load the skill. Installing or refreshing the package does not guarantee that an already running task has reloaded it.

## Usage

In Claude Code:

```text
/plugin-release:release /absolute/path/to/repo의 플러그인을 모두 검증해줘
/plugin-release:release /absolute/path/to/repo의 suno-music을 0.2.0으로 올리고 커밋과 푸시까지 해줘
```

In Codex:

```text
$plugin-release:release /absolute/path/to/repo의 플러그인을 모두 검증해줘
$plugin-release:release /absolute/path/to/repo의 새 플러그인을 두 마켓플레이스에 등록해줘
```

Provide the source repository path if it is outside the current workspace. The installed plugin directory is where the helper lives; it is not the repository to release.

Requests to check stay read-only except for side effects of explicitly requested package tests or native validators. A request to prepare or register applies reviewed local metadata changes. A request that includes release, commit, or push authorizes those specified steps; the skill does not ask for the same authorization again. If publishing was not requested, it presents the prepared result before asking about a push.

## Prerequisites

- Node.js 20 or later and a local source checkout.
- npm when running plugins that declare an npm test script. Review unfamiliar repository test scripts before executing them.
- Git for diff review, commits, and remote verification; existing credentials and a writable remote for a push.
- Claude Code CLI is optional for static checks. `--native` uses `claude plugin validate <plugin-dir> --strict` when available; requesting it when Claude is unavailable produces an incomplete check and exit code 1.

Verified on macOS. On POSIX systems, timed-out or over-output test/validator processes and their process groups are terminated. Windows has not been verified and retains direct-child termination only. Package tests are executable repository code, not a sandbox; inspect unfamiliar scripts before opting in.

No runtime dependencies, added OAuth application, or new service account are needed by this plugin.

## CLI

Replace `/installed/plugin-release` with the actual installed plugin root. Every invocation names the source repository explicitly.

```sh
node /installed/plugin-release/scripts/release.mjs check --repo /absolute/path/to/repo --all --tests --native
node /installed/plugin-release/scripts/release.mjs check --repo /absolute/path/to/repo --plugin suno-music --json
node /installed/plugin-release/scripts/release.mjs prepare --repo /absolute/path/to/repo --plugin suno-music
node /installed/plugin-release/scripts/release.mjs prepare --repo /absolute/path/to/repo --plugin suno-music --version 0.2.0
node /installed/plugin-release/scripts/release.mjs prepare --repo /absolute/path/to/repo --plugin suno-music --version 0.2.0 --write
```

`check` validates the selected plugin or all discovered plugins. Its JSON report has top-level `ok`, `status` (`passed`, `failed`, or `incomplete`), `issues`, `plugins`, `tests`, `native`, `git`, and `published: false` fields. Read individual results as well as `status`; the CLI does not publish anything.

`--tests` runs declared package tests. Without it, tests are `not_run`, the report is `incomplete`, and a successful static check exits 0. Requesting `--tests` for a package without a test script yields `incomplete` and exits 1. `--native` requests Claude validation; an unavailable Claude CLI also yields `incomplete` and exits 1. A failed check or test is reported as failed. Codex validation is built-in static checking; a full native Codex validator is intentionally not bundled and is reported as `not_run` without gating the check. None of these statuses imply complete official host validation.

`prepare` defaults to a dry run that identifies the exact changed files and their before/after contents. Its JSON report includes `ok`, `mode` (`preview` or `written`), and `changes`, whose entries contain `path`, `before`, and `after`. Without `--version`, it synchronizes local marketplace registration for the host manifests the plugin already declares. With `--version`, it also synchronizes that exact version across the declared host manifests, an existing `package.json`, and the Claude marketplace entry. The supplied version must be greater than the current version; the tool does not guess a release number. `--write` applies the local plan.

Preparation preserves unrelated JSON fields, other plugins' registrations, and existing host support. It does not invent a missing host manifest or convert an unsupported plugin into a dual-host plugin. Review the diff and check the result before committing.

A same-name external registration blocks preparation instead of being converted silently. Staged target metadata and edits made after a preview are rejected. Write errors trigger rollback of already replaced files; a process crash is not a cross-file transaction, so inspect the diff after an interrupted write.

## Release workflow

The host skill checks package metadata, tests, and available native validation; previews the requested registration or version update; applies it; and reviews the final scoped diff. When authorized to publish, it stages exact relevant paths, commits, pushes the observed branch, and verifies the pushed commit with `git ls-remote`. The CLI has only `check` and `prepare` commands; the host skill performs the Git release workflow.

The completion message distinguishes local preparation, commit, remote publication, and host installation. It reports missing validators or tests honestly. Tags and GitHub Releases are created only when requested separately.

## Supported scope

This version supports source plugins in local marketplace repositories, using `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`. It is intended for local plugin sources such as `plugins/<name>/`, including Claude-only, Codex-only, and dual-host packages. Remote-source catalog entries and unrelated metadata are preserved; the plugin does not manage their external repositories or hosted marketplace review.

Runtime integrations, credentials used by another plugin, installation behavior inside a fresh host, and the quality of a plugin's generated outputs still need their own verification. A passed package check or Git push does not establish those outcomes.

## Development

```sh
npm test
node scripts/release.mjs check --repo /absolute/path/to/work-with-tony --plugin plugin-release --tests --native
```
