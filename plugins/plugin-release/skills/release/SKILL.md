---
name: release
description: Validate, register, version, and release local Claude Code and Codex plugins. Use when the user asks to check a plugin package, synchronize marketplace entries, prepare a version, or commit and push a plugin release.
---

# Plugin Release

Turn the user's requested release into a checked, reviewable result. Use `/plugin-release:release` in Claude Code or `$plugin-release:release` in Codex. Communicate in the user's language and lead with the resulting status.

## Resolve the target and authority

1. Identify the requested operation: check, register, prepare a version, or publish. A check request authorizes inspection and relevant diagnostics, not metadata edits or publishing. A register or prepare request authorizes local changes. A release, commit, or push request authorizes the corresponding specified Git steps. Preserve authorization already given in this conversation; do not ask again for a routine step it covers.
2. Resolve the real source repository from the user's explicit path, the current workspace, and observed Git information. Inspect repository instructions and `git status --short --branch`, the repository root, branch, and remotes. Never infer a source checkout from this installed skill's cache path. If the repository or target is genuinely ambiguous, ask one concise question after doing useful independent inspection.
3. Resolve the installed helper separately. In Claude Code, use the actual `CLAUDE_PLUGIN_ROOT` when provided. In Codex, the plugin root is two levels above this `skills/release/SKILL.md` directory. Use the absolute observed path to `scripts/release.mjs`; shell-quote paths. Always pass an explicit absolute `--repo` source path.
4. Preserve unrelated work in the checkout. Review untracked files as well as tracked changes. Inspect unfamiliar test scripts before executing them. Do not run destructive Git cleanup or force-push to make a release pass.

## Check and prepare

The bundled CLI contract is:

```text
node <installed-plugin>/scripts/release.mjs check --repo <absolute-source-repo> [--plugin <name> | --all] [--tests] [--native] [--json]
node <installed-plugin>/scripts/release.mjs prepare --repo <absolute-source-repo> --plugin <name> [--version <exact-version>] [--write] [--json]
```

The CLI supports only `check` and `prepare`; there is no `release` subcommand. The host skill performs the release workflow and Git operations.

For a release, run `check` with `--tests --native` for the selected plugin, or `--all` for a repository-wide request. The JSON report has top-level `ok`, `status` (`passed`, `failed`, or `incomplete`), `issues`, `plugins`, `tests`, `native`, `git`, and `published: false` fields. Read individual evidence as well as `status` and the exit code.

Without `--tests`, tests are `not_run`, the report is `incomplete`, and passing static checks exit 0. With `--tests`, a missing package test script gives an incomplete report and exit code 1. Requested Claude native validation that cannot run because the CLI is unavailable also gives an incomplete report and exit code 1. The Claude native command is `claude plugin validate <plugin-dir> --strict`. Built-in Codex checks are static checks, not full official Codex validation; a native Codex validator is intentionally not bundled and is reported as `not_run` without gating the check.

Fix in-scope issues necessary for an authorized preparation or release, then rerun the checks affected by the fix. If the user only requested checking, report findings without implementing fixes. A failed test is a failed check, never a passed release. Resolve missing prerequisites when possible within the user's scope. Explicitly requested validation that did not run remains incomplete; do not silently upgrade it to success. Missing optional tooling does not itself create a requirement for a new permission question.

Run `prepare` without `--write` first and inspect its exact files and before/after contents. The JSON report contains `ok`, `mode` (`preview` or `written`), and `changes` entries with `path`, `before`, and `after`. Omitting `--version` synchronizes marketplace registration for the already declared hosts without changing the version. Supplying an exact version greater than the current version synchronizes declared manifests, an existing package version, and the Claude catalog entry. Use the user's version; if no version was specified, registration-only preparation is available and does not require guessing a bump. If a new version is necessary for the user's requested outcome but cannot be established, finish the other checks and ask for the exact version.

Check that unrelated fields and catalog entries remain intact. Preparation must not add a missing host manifest just to make a plugin appear compatible. If changes match the user's requested registration or preparation, run the same command with `--write`, inspect the actual diff, and run the necessary final checks. If package lockfiles or other release metadata exist outside the helper's supported updates, inspect and update them using the repository's established workflow when in scope; do not leave known version mismatches.

## Publish when authorized

Review the final tracked and untracked changes. Identify which exact paths belong to this release and stage those paths explicitly; never use `git add .`. Check the staged diff before committing so unrelated staged changes are not included. Do not overwrite another person's edits to obtain a clean tree.

When commit and push are authorized, make the release commit using the repository convention and push to the observed intended remote and branch. Do not assume the branch is `main`. If publishing was not authorized, first finish the concrete local preparation and verification, show the result, and ask one concise question about the remaining external action. Explain that the user's current scope has not included that action; do not invent a mandatory second approval from this skill.

After a push, obtain the local commit and query `git ls-remote <observed-remote> refs/heads/<observed-branch>`. Claim remote publication only when the returned hash matches the pushed commit. If it does not match, inspect the remote state before taking further action; do not overwrite newer work. Do not create tags or GitHub Releases unless the user asks for them.

Refresh or install the requested host package only when that is part of the user's request. Observe the actual host commands and results. Installation and loading into the current conversation are separate: never claim that an existing task hot-loaded a newly installed skill. A fresh host session may be required.

## Report evidence

Keep the handoff concise and distinguish these states:

- Checked: the checks that passed, failed, or were not run, including test results and native-validator availability.
- Prepared: exact plugin, version if changed, and local files updated.
- Committed: commit identifier if one was created.
- Pushed: observed remote and branch with matching remote commit, if verified.
- Installed: requested host and observed installation result, if performed.

Link relevant files or the verified remote commit. A successful static check is not a completed release, a local commit is not a push, and a push is not host installation. Mention material remaining limitations without adding unrelated warning checklists.
