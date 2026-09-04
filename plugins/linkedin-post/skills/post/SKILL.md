---
name: post
description: Draft a LinkedIn post from a one-line topic or a source file, refine it in conversation, and publish it to the user's personal LinkedIn profile through the official API once they explicitly confirm. Use when the user types /linkedin-post:post, asks to write or publish a LinkedIn post, or wants to turn notes, a blog post, or a retro into a LinkedIn update.
---

# LinkedIn Post

Write the post; let the scripts talk to LinkedIn. You never call the LinkedIn API yourself and never print tokens or secrets.

This skill also triggers on natural-language requests like "write a LinkedIn post about ..." or "post this to LinkedIn" — not only the explicit `/linkedin-post:post` command.

Run every script with the `CLAUDE_PLUGIN_ROOT` environment variable, which Claude Code sets to this plugin's root when the skill loads:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/publish.mjs" "<draft path>"
node "${CLAUDE_PLUGIN_ROOT}/scripts/auth.mjs"
```

If `CLAUDE_PLUGIN_ROOT` is unset, the plugin root is two directories above the base directory announced when this skill loaded.

## Personal data location

`LINKEDIN_POST_HOME` env var if set, otherwise `~/.linkedin-post/`:

- `config.json` – LinkedIn app client id/secret
- `token.json` – access token (managed by `scripts/auth.mjs`)
- `references/` – other people's posts the user likes (markdown) — this is `$LINKEDIN_POST_HOME/references/` (default `~/.linkedin-post/references/`), not the skill's own `references/` folder described below
- `drafts/` – confirmed body waiting to be published
- `published/` – copies of published posts, `YYYY-MM-DD-<slug>.md`
- `my-style.md` – the user's own style rules, appended only on request

This skill's own docs live alongside this file, at `<skill>/references/style-guide.md` and `<skill>/references/post-types.md` — do not confuse these with `$LINKEDIN_POST_HOME/references/` above.

## 0. First run

If `config.json` is missing:
1. Explain in two or three sentences that LinkedIn requires a free developer app, then give these steps:
   - Go to https://www.linkedin.com/developers/apps and create an app (any name; a LinkedIn Page to associate is required by LinkedIn, the user's own page or a placeholder page works).
   - In the **Products** tab add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
   - In the **Auth** tab add redirect URL `http://localhost:8585/callback` and copy the Client ID and Primary Client Secret.
2. Ask for the Client ID and Client Secret. Write them to `config.json` as `{"client_id": "...", "client_secret": "..."}` and create `references/`, `drafts/`, `published/` under `$LINKEDIN_POST_HOME`. Do not echo the secret back.

If `token.json` is missing or `publish.mjs --dry-run` reports `MISSING_TOKEN`/`TOKEN_EXPIRED`:
- Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/auth.mjs"`. It opens the browser; tell the user to sign in there. Report only the `name` from the JSON result.

## 1. Load context

Read, in this order:
1. `<skill>/references/style-guide.md` and `<skill>/references/post-types.md` (this skill's own folder).
2. `my-style.md` if it exists. Its rules override the style guide.
3. Every file in `$LINKEDIN_POST_HOME/references/` (user's saved example posts), up to 10.
4. The 5 most recent files in `published/`.

Parse the invocation:
- `/linkedin-post:post <text>` – if `<text>` is an existing file path, read it as source material; otherwise treat it as the topic.
- `--en` anywhere in the arguments → write in English. Default is Korean, polite form.
- `--visibility connections` → pass through to publish. Default public.
- No arguments → ask one question: "What is the post about? A topic line or a file path works."

If the topic is a single line, ask at most two questions before drafting: the one concrete experience behind it, and whether there is a number or specific example to include. If the user gives a file, do not ask; draft from it.

## 2. Draft

1. Pick a post type using the "Choosing" rules in `post-types.md`. If two fit, ask which.
2. Write the post following the type skeleton and the style guide. Mirror the tone of `my-style.md` and `$LINKEDIN_POST_HOME/references/` when present.
3. Show the draft in a fenced block, then directly below it:
   - `Type:` the post type
   - `Chars:` character count (code points) and the 3000 limit
   - `Preview:` the first two lines as they will appear before "see more"
   - `Hashtags:` count
4. Iterate on feedback in conversation. Do not run any script in this phase.
5. If the user gives a style remark that should persist ("shorter openings", "no emoji"), ask "Save this to my-style.md?" and append one line only if they say yes.
6. If the user pastes someone else's post as a reference, save it to `$LINKEDIN_POST_HOME/references/<YYYY-MM-DD>-<slug>.md` and say so.

## 3. Confirm and publish

Never publish without an explicit confirmation such as "올려", "발행", "게시", "publish", "post it". A positive remark about the draft is not confirmation. When in doubt, ask "Publish this to LinkedIn now?".

On confirmation:
1. Write the final body (exactly what was shown, hashtags included) to `drafts/<unix-timestamp>-<slug>.md`. The slug is 3–6 lowercase ASCII words from the topic joined by `-`.
2. Run:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/publish.mjs" "<draft path>" [--visibility connections]`
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
   - Show `code`, `message`, `hint`, and `response` (when present — LinkedIn's raw rejection detail, e.g. for `BAD_REQUEST`) to the user in plain language. For `MISSING_TOKEN`/`TOKEN_EXPIRED`/`UNAUTHORIZED`, offer to run `node "${CLAUDE_PLUGIN_ROOT}/scripts/auth.mjs"` and then retry the same draft file. For `SERVER_ERROR` or `NETWORK`, tell the user to check their feed before retrying because the post may have gone through.
   - Never rerun publish automatically.

Use `node "${CLAUDE_PLUGIN_ROOT}/scripts/publish.mjs" "<draft path>" --dry-run` when you need to check the token or the escaped body without posting.

## Rules

- Never paste `client_secret` or `access_token` into the conversation, even partially.
- Never modify `token.json` or `config.json` except as described in section 0.
- Never publish images, schedule posts, or post to company pages. Say those are out of scope if asked.
- Keep the draft you show and the body you publish identical.
