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
