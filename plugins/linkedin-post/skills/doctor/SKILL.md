---
name: doctor
description: Check that the linkedin-post setup still works before it breaks a publish - config, token expiry, token file permissions, LinkedIn API version, leftover drafts, and a live read-only check against LinkedIn. Use when the user types /linkedin-post:doctor (Claude Code) or $linkedin-post:doctor (Codex), asks whether LinkedIn posting still works, asks when the LinkedIn token expires, or after a publish fails with UNAUTHORIZED, TOKEN_EXPIRED, or API_VERSION_INACTIVE.
---

# LinkedIn Post Doctor

Run the health check script and explain the result. You never call the LinkedIn API yourself.

In Claude Code, `CLAUDE_PLUGIN_ROOT` points at this plugin's root. If it is unset (Codex, or any host that does not set it), use the directory two levels above the base directory announced when this skill loaded (`.../skills/doctor` → `...`).

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"
node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs" --offline
```

Use `--offline` when the user asks for it or has no network. Otherwise run it online: it makes read-only requests (who am I, and which API versions LinkedIn still serves). It never posts.

## Reading the result

The script prints one JSON line: `ok`, `home`, `offline`, and `checks`. Each check has `id`, `status` (`ok`, `warn`, `fail`), `message`, and sometimes `hint`, `code` and details.

| id | What it tells you |
|---|---|
| `config` | `config.json` has the app's client id and secret |
| `token` | who is signed in, `expiresOn`, `daysLeft` |
| `token-file` | `token.json` is readable only by the user |
| `api-version` | the `LinkedIn-Version` in use (`source`: default or `LINKEDIN_API_VERSION`), its age, and `stopsAround` |
| `drafts` | files left in `drafts/`, which means a publish did not finish |
| `token-live` | LinkedIn accepted the token just now (online only) |
| `api-version-live` | LinkedIn serves the version right now, and `latestActive` (online only) |

Reply in the user's language, Korean polite form by default:

1. One line with the overall result. If everything is `ok`, add the token expiry date and days left, then stop.
2. For each `warn` or `fail`, one line saying what is wrong and the next step, taken from `hint`:
   - `token` or `token-live` fail/warn: offer to run `node "${CLAUDE_PLUGIN_ROOT}/scripts/auth.mjs"`. It opens the browser; report only the `name` it returns. Run it only if the user agrees.
   - `api-version` or `api-version-live` fail: the fastest fix is the environment variable `LINKEDIN_API_VERSION=<latestActive>`; the lasting fix is updating `DEFAULT_API_VERSION` in `scripts/lib/linkedin-api.mjs` in the plugin's source repository and releasing a new version. Do not edit the installed copy under the plugin cache.
   - `token-file` warn: offer to run the `chmod 600` command from the hint.
   - `drafts` warn: list the file names and tell the user to check their LinkedIn feed before publishing any of them again, because the post may already be live.
3. When `api-version-live` is `ok` but `latestActive` is newer than `version`, say in one line that a newer version exists. This needs no action until `api-version` warns.

After fixing something, run the doctor again and report the new result in one line.

## Rules

- Never paste `client_secret` or `access_token` into the conversation, even partially, and never read `token.json` or `config.json` to show them.
- Never edit `token.json` or `config.json` from this skill; sign-in goes through `scripts/auth.mjs`.
- The doctor never publishes. If the user wants to post, hand over to `/linkedin-post:post`.
