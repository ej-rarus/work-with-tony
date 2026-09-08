---
name: prepare
description: Fill Suno's Advanced creation form with user-approved title, lyrics, style, and optional settings, verify the populated values, and stop before generation. Use when the user types /suno-music:prepare in Claude Code, $suno-music:prepare in Codex, or asks to put lyrics and style into Suno.
---

# Suno Music Prepare

Prepare the form; the user creates the song. Never click, press, or otherwise invoke `Create song`.

## 1. Collect and validate

Read `title` when supplied, plus required `lyrics` and `style`. Optional inputs are `vocalGender` (`male` or `female`), `model`, and `excludeStyles`.

Preserve the user's title, lyrics, and style exactly. Do not rewrite, translate, normalize whitespace, add section labels, or improve them unless the user asks. Count Unicode code points before browser use. Refuse to enter lyrics over 5,000 characters or style over 1,000 characters, and report the measured count.

Ask only for missing `lyrics` or `style`. Summarize the values that will be entered; invoking this skill or asking to enter them into Suno authorizes transmitting those exact values to `suno.com`.

## 2. Select the Suno page

Use browser control only. Reuse an open `https://suno.com/create` tab when available; otherwise open it. Do not use HTTP requests, private endpoints, page cookies, session tokens, shell browser automation, or a separate browser profile.

Read fresh browser state before every decision. If Suno shows a sign-in or session-recovery page, leave it visible for the user and stop. Do not enter credentials, complete CAPTCHA, change plans, buy credits, or modify account settings.

## 3. Inspect before changing anything

Select the `Advanced` tab if it is not already selected, then read fresh browser state again. Inspect the current values for `Lyrics editor`, the editable field inside the `Styles` section, `Song Title (Optional)`, and any requested options.

If the existing form contains a title, lyrics, style, or option value that this run would replace, show which fields are populated and request confirmation immediately before clearing or replacing them. Without that confirmation, stop with the existing form unchanged.

## 4. Fill by semantic labels

Use semantic labels and scope, not fixed coordinates or stale accessibility indexes:

1. Fill `Lyrics editor` with `lyrics`.
2. In the `Styles` section, fill its editable text field with `style`. Its accessible name may show rotating recommendation text, so scope the field to the expanded `Styles` section and require exactly one editable match.
3. Fill `Song Title (Optional)` when `title` was supplied.
4. Expand `More Options` only when `vocalGender` or `excludeStyles` was supplied. Fill `Exclude styles` when supplied; select `Male` or `Female` only for the corresponding requested value.
5. Change the model only when `model` was supplied and that exact model is visibly available in the model selector. Otherwise leave the current model unchanged and report that the requested model was unavailable.

After every interaction, read fresh browser state before the next interaction. If any field is missing or resolves ambiguously, stop and report the unresolved field; do not fall back to fixed coordinates.

## 5. Verify and hand off

Read back title, lyrics, style, requested vocal gender, requested model, and exclude styles. Compare text by exact code points and report any mismatch. Do not repair a mismatch by clearing a populated field unless the user already confirmed replacement.

When every requested value matches, leave the Suno tab visible and report `폼 준비 완료`. Remind the user that the form is prepared but no credits have been spent and no song has been created.

Never click, press, or otherwise invoke `Create song`, even when the same request says to generate, proceed, or create the song. Never upload audio, use Voice, use Inspo, open Saved lyrics, download, publish, or distribute a song.
