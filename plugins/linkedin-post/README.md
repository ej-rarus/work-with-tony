# linkedin-post

Draft LinkedIn posts in a Claude Code conversation and publish them to your personal profile through the official LinkedIn API. Text posts only, published immediately, always after your explicit confirmation.

## Install

Works in Claude Code and in Codex; both read the same skill and scripts.

Claude Code:

```
/plugin marketplace add ej-rarus/work-with-tony
/plugin install linkedin-post@work-with-tony
```

Codex:

```
codex plugin marketplace add ej-rarus/work-with-tony
codex plugin add linkedin-post@work-with-tony
```

No npm dependencies. The scripts refuse to run on a Node version older than 20 and print a `NODE_TOO_OLD` error instead.

## One-time setup: LinkedIn developer app

LinkedIn only lets you post through an app you own. It takes about five minutes and is free.

1. Open https://www.linkedin.com/developers/apps and click **Create app**. Any name works. LinkedIn asks you to associate a LinkedIn Page; use your own page or create a placeholder page.
2. **Products** tab: add **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**. Both are self-serve and approved instantly.
3. **Auth** tab: under *Authorized redirect URLs* add `http://localhost:8585/callback`. Copy the **Client ID** and **Primary Client Secret**.
4. Run `/linkedin-post:post` in Claude Code (or `$linkedin-post:post` in Codex). The skill asks for the two values and writes them to `~/.linkedin-post/config.json`, then runs the sign-in script which opens your browser.

The client secret is typed into the conversation once; it is stored only in `~/.linkedin-post/config.json` and never committed.

Tokens last 60 days. When one is about to expire the publish step warns you; when it has expired the skill offers to run sign-in again.

## Health check

```
/linkedin-post:doctor
```

(`$linkedin-post:doctor` in Codex.) Checks the setup before it breaks a publish: config, token expiry date and days left, token file permissions, the `LinkedIn-Version` in use and roughly when LinkedIn retires it, drafts left behind by a failed publish, and, online, whether LinkedIn accepts the token and still serves the version (plus the newest version it serves). The online part only makes read-only requests; add `--offline` to skip it.

LinkedIn retires each monthly API version after about 12 months. When the doctor reports the version as inactive, publish with `LINKEDIN_API_VERSION=<latestActive>` right away, and bump `DEFAULT_API_VERSION` in `scripts/lib/linkedin-api.mjs` for a lasting fix.

## Usage

Claude Code uses `/linkedin-post:post ...`; in Codex type `$linkedin-post:post ...` with the same arguments.

```
/linkedin-post:post 이번 주 Claude Code 스킬 만들면서 배운 점
/linkedin-post:post ~/notes/retro.md
/linkedin-post:post --en What I learned shipping a side project in a weekend
/linkedin-post:post --visibility connections 팀에만 공유할 이야기
```

You can also just ask in conversation — "write a LinkedIn post about ..." or "post this to LinkedIn" — without typing the slash command.

The skill drafts, shows character count and the two-line preview, iterates with you, and publishes only when you say so (for example "올려" or "publish").

Each draft also picks one of six post structures (`scene`, `rules`, `questions`, `contrarian`, `compare`, `short`) and avoids the structures used by your three most recent posts, so a daily habit does not turn into the same arc every day. See `skills/post/references/structures.md`; drop a `structures.md` into `~/.linkedin-post/` to replace it with your own.

### Pre-publish check

Every draft is checked against `skills/post/references/publish-check.md` before it goes out. The default asks two questions: does the reader read this as being about their own work, and does the reader leave with something they can use. Each gets PASS or FLAG with a one-line reason under the draft. A FLAG never blocks publishing; it only adds one extra confirmation. Put your own questions, for example ones derived from your post statistics, in `~/.linkedin-post/publish-check.md` to replace the default.

### Recording reactions

LinkedIn does not let a personal developer app read likes or comments, so you paste them:

```
반응 기록: 좋아요 23, 댓글 4
(댓글 본문을 그대로 붙여넣기)
```

The skill writes a `stats:` block into the post's file under `published/` and appends the comments under `## Reactions (date)`. Later drafts read those reactions as material, and a comment with a question or a disagreement becomes a suggested follow-up topic.

### Stats from the analytics export

LinkedIn does not let a personal app read post analytics, but its own export has them. Download it from Analytics > Posts > Export (choose the past 365 days) and run:

```
/linkedin-post:stats ~/Downloads/AggregateAnalytics_….xlsx
```

(`$linkedin-post:stats` in Codex.) It matches each post in the export to your file in `published/` by post id, records `impressions` and `engagements` (reactions + comments + clicks, kept apart from hand-recorded likes) under `stats:`, and then compares post structures and types by median and mean impressions and engagement rate. Counts are never lowered, and a shorter export skips posts published before its range because their numbers would be partial. Posts younger than three days are left out of the comparison, and groups with fewer than three posts are marked as small. When a pattern is strong enough, it offers one rule for your `publish-check.md`, which it adds only if you agree.

### Series

Add `series: <slug>` when publishing a post that continues an earlier one. The next time a topic fits that series, the skill reads every post in it before drafting so the reference back is deliberate.

## Files it keeps

All under `~/.linkedin-post/` (override with `LINKEDIN_POST_HOME`):

| Path | What |
|---|---|
| `config.json` | Client ID and secret |
| `token.json` | Access token, mode 0600 |
| `references/` | Example posts you like |
| `drafts/` | Confirmed body awaiting publish |
| `published/` | Copy of each published post with date, URL, type, structure, optional series and stats |
| `my-style.md` | Your own style rules, appended only when you ask |
| `structures.md` | Optional; replaces the skill's built-in structure catalog |
| `publish-check.md` | Optional; replaces the built-in pre-publish questions |

Nothing personal is stored inside the plugin directory.

## Scripts

```
node scripts/auth.mjs                       # browser sign-in, saves token.json
node scripts/publish.mjs body.md            # publish, prints one JSON line
node scripts/publish.mjs body.md --dry-run  # show escaped request, no API call
node scripts/record.mjs published/2026-09-10-post.md --likes 23 --comments 4 --reactions-file comments.md
node scripts/doctor.mjs                     # health check, prints one JSON line
node scripts/doctor.mjs --offline           # same, without network calls
node scripts/stats.mjs import export.xlsx [--write]  # match the analytics export to published/
node scripts/stats.mjs report                  # compare structures and types
```

Exit codes for `auth.mjs` and `publish.mjs`: 0 success, 1 LinkedIn API error, 2 configuration or validation error. For `record.mjs` (no API call): 0 success, 1 usage error, 2 file or frontmatter problem. For `doctor.mjs`: 0 no failed check (warnings allowed), 1 at least one failed check, 2 bad arguments. For `stats.mjs`: 0 success, 1 usage error, 2 file or data problem.

## Out of scope (for now)

Images and documents, scheduled posts, company pages, editing or deleting posts, reading analytics through the API.

## Development

```
npm test
claude plugin validate . --strict
claude --plugin-dir .    # try the skill in a session
```
