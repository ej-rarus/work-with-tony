# Plugin Release v0.1

Build a shared Claude Code / Codex plugin for releasing repository-local plugins.
The user selected this plugin from the proposed roadmap on 2026-09-08.

## User flow

Invoke `/plugin-release:release` (Claude) or `$plugin-release:release` (Codex)
with a source repository and optionally one plugin and its next version. The
agent checks the package, runs its tests, prepares version/registration changes,
reviews the exact diff, and completes authorized Git publication. A request to
check or prepare alone does not publish. Existing publication approval is reused.

## Deterministic CLI

- `check --repo PATH [--plugin NAME | --all] [--tests] [--native] [--json]`
  validates package names, versions, declared files, skill entrypoints, and local
  marketplace registrations. Tests and the installed Claude validator are opt-in.
  Git state and skipped verification are reported separately from static success.
- `prepare --repo PATH --plugin NAME [--version VERSION] [--write] [--json]`
  computes exact changes. With no version it reconciles registrations only;
  a new version updates declared host manifests, optional package.json, and the
  Claude catalog entry. Codex catalog entries have no version. Default is preview.

The source repository is explicit and never inferred from the installed plugin
cache. This first version supports `plugins/<name>` and local source entries in
`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`.

## Implementation boundaries

Node 20+ built-ins; no runtime dependencies or API credentials. Static validation
is a pure read of the selected repository. Test commands execute only through
`--tests`, with a timeout and a recursion guard. Native verification distinguishes
missing CLI from pass/fail. The built-in Codex checks are scoped package checks,
not a claim of complete official schema validation.

Prepare validates all target JSON before writing, preserves unrelated keys and
entry order, checks paths remain inside the repository, rejects duplicate entries
and staged target JSON, and detects changes between read and write. It stages
temporary siblings before replacing files and restores replaced files on a
reported write error. It does not guarantee a cross-file transaction after a
process crash; inspect Git diff after interruption.

The skill handles Git publication with explicit file staging and verification of
the actual remote ref. It creates no tags or GitHub Releases unless requested.
It must not infer that a local commit was pushed or a pushed plugin was installed.

## Verification

Use isolated fixture repositories for valid and invalid catalog/package cases,
version changes, dry-run/write/no-op behavior, preservation of unknown fields,
path escapes, dirty/staged state, test failure and recursion, and native validator
availability. Run the finished checker on all existing plugins and itself; validate
the produced package with the installed Claude/Codex validators. Independently
review subprocess/path handling and test the release skill's dry-run flow.

## References

- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/plugin-marketplaces
- Local Codex plugin-creator schema reference and installed CLI help (2026-09-08).
