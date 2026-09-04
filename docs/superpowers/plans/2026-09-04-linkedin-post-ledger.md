# SDD ledger — plan: /Users/lukukutony/Documents/work-with-tony/docs/superpowers/plans/2026-09-04-linkedin-post.md
Spec: docs/superpowers/specs/2026-09-04-linkedin-post-design.md (read)
Branch: main. Ruling: implement directly on main — user's standing preference for solo/personal repos is direct-main commits, no PR flow; repo is brand new with no collaborators — cost if wrong: history on main without a branch to discard, recoverable via git reset.

## Preflight scan
| Pair / Task | Produces vs consumes | Finding |
|---|---|---|
| T2→T6,T7 | loadToken {accessToken,expiresAt,personUrn,name}, getHome(env), tokenStatus, ConfigError | consistent |
| T2→T5,T6,T7 | redact(text, secrets[]) | consistent |
| T3→T6 | escapeCommentary, countChars, MAX_POST_LENGTH | consistent |
| T4→T6,T7 | createClient({accessToken,fetchImpl,sleep,retryDelayMs}).createPost({authorUrn,commentary,visibility}) / getUserInfo | consistent |
| T5→T7 | generateState, buildAuthorizeUrl({clientId,state}), parseCallback(url,state), exchangeCode({...}), CALLBACK_PORT, CALLBACK_TIMEOUT_MS, OAuthError | consistent |
| T1→T9 | plugin-package.test.mjs extended; import readText merged into existing helpers import | consistent |
| T8→T9 | post type keys ai-tools/philosophy/side-project/pm-insight | consistent |
| T1→T10 | marketplace name work-with-tony, install commands | consistent |
| T6 internal | dry-run chars for "안녕하세요 (테스트)" = 11 (fixed in plan before execution) | ok |
| T1 internal | secret regex vs own test source / SKILL.md placeholders | no self-match |
| T7 | no automated tests by plan design (manual T11); node --check + MISSING_CONFIG smoke | accepted, spec §8 says manual |
Scan clean after the chars fix. Proceeding.

Task 1: minor (deferred): package.json scripts point at not-yet-existing scripts/ (transient until T6/T7)
Task 1: minor (deferred): secret-scan walk() reads all files as utf8; add binary guard if assets are ever added
Task 1: ⚠️ commit approval — resolved: user approved plan incl. per-task commits (chose option 1 after explicit note)
Task 1: complete (commits 604bc2a..03a428a, review clean)
Task 2: minor (deferred): redact() split/join can miss overlapping secrets; sort by length desc before reducing
Task 2: minor (deferred): readJsonFile drops original parse error (no `cause`)
Task 2: complete (commits 03a428a..387154c, review clean)
Task 3: minor (deferred): lookahead escape heuristic lacks a comment; doubled-backslash edge untested
Task 3: complete (commits 387154c..47fdb67, review clean)
Task 4: Ruling: "any fetchImpl exception classified NETWORK and retried once" (Important, plan-mandated) — code stands. Node's fetch surfaces connectivity failures as TypeError("fetch failed") and reliably separating them from programmer errors would mean sniffing `cause.code`, which is brittle; misclassification only costs a 3s delay and a NETWORK label on a bug that would fail anyway. Cost if wrong: a programming error is reported as a connectivity problem, masking the root cause in the hint text.
Task 4: minor (deferred): test title says 4xx but exercises 500; missing x-restli-id error has empty body; unused catch binding
Task 4: complete (commits 47fdb67..5a8dda6, 1 parked with ruling)
Task 5: Ruling: unguarded JSON.parse / missing access_token on a 200 token response (Important, plan-mandated) — FIX. Spec §6 auth step 6 requires token-exchange failures to surface as a distinct message; a malformed 200 is such a failure and must become OAuthError EXCHANGE_FAILED, not a raw SyntaxError. Cost if wrong: one extra test and ~6 lines.
Task 5: minor (deferred): redact exact-substring won't catch URL-encoded secret echo
Task 5: fix round 1/5 (1 addressed, 0 open — malformed token response typed error; commits 7db3743..a0a2d42)
Task 5: complete (commits 5a8dda6..a0a2d42, review clean)
Task 6: minor (deferred): CLI entry `.then(exit)` lacks `.catch`; Interfaces block omits TOKEN_EXPIRED code; no exact-3000 boundary test
Task 6: ⚠️ live API path unverified — resolved: covered by Task 11 manual E2E by design
Task 6: complete (commits a0a2d42..69aee22, review clean)
Task 7: Ruling: openBrowser spawn 'error' event unhandled (Important, plan-mandated) — FIX. A public plugin must not crash when `open`/`xdg-open`/`start` is unavailable; attach an error listener that prints the URL fallback, and use shell for win32. Also fold in HTML-escaping of the failure page (minor, one helper). Cost if wrong: ~10 lines, no behavior change on the happy path.
Task 7: minor (deferred): waitForCallback may settle twice (harmless with native Promise); OAuthError has no .hint
Task 7: fix round 1/5 (2 addressed, 0 open — spawn error listener + win32 cmd wrapper; escapeHtml on failure page; commits 50da5e5..d594c50)
Task 7: complete (commits 69aee22..d594c50, review clean)
Task 8: complete (commits d594c50..e792645, review clean)
Task 9: complete (commits e792645..e6aef2a, review clean)
Task 10: complete (commits e6aef2a..9bfbb4e, review clean)
Final review: With fixes. 1 Critical (createPost network retry may double-publish), 7 Important (IPv4-only callback bind vs localhost, EADDRINUSE mislabeled TIMEOUT, /linkedin-post invocation not real for installed plugin, plugin-root resolution fragile, ambiguous references/ dir, no Node<20 guard + no .catch, runAuth untested).
Final review: Ruling: T4 network-retry ruling REVERSED — reviewer showed the retry can duplicate a post when the socket drops after send; createPost now retries only on pre-send errors (DNS/connect), getUserInfo retries freely. Cost if wrong: a transient post-send failure needs a manual retry after checking the feed.
Final review: Ruling: skill invocation — rename skill dir/name to `post` so the installed command is `/linkedin-post:post <args>`; do NOT add a commands/ dir (skills accept arguments; a command would only duplicate). Update README/SKILL/tests. Cost if wrong: a rename, trivial.
Final review: Ruling: plugin-root resolution — SKILL.md instructs `${CLAUDE_PLUGIN_ROOT}` in Bash commands, with the skill's announced base directory (two levels up) as fallback. Cost if wrong: one path line in SKILL.md.
Final review: Ruling: client secret transits chat (Minor) — stands per spec §5; README gets an honest note.
Final fix wave: 9bfbb4e..d8558e9 (4 commits), scoped re-review: all findings addressed.
Final: parked — optional ::1 listener hitting EADDRINUSE alone rejects the whole auth flow as PORT_IN_USE even though 127.0.0.1 succeeded — Ruling: leave; requires an unrelated process bound only to the IPv6 loopback on 8585, and the user-facing hint ("free port 8585") is still correct. Cost if wrong: one confusing sign-in failure in a rare port collision.
Tasks 1-10 complete; Task 11 (manual E2E) pending user action.
