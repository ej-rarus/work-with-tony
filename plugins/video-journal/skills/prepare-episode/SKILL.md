---
name: prepare-episode
description: "Prepare or resume a numbered video diary episode from a selected topic. Use for 회차 준비해줘, /video-journal:prepare-episode (Claude Code), or $video-journal:prepare-episode (Codex). Supports a read-only preview and a Drive work record with a shooting checklist and script."
---

# Prepare a video diary episode

Use [channel settings and Drive identity](../../references/drive.md). A selected topic and a resolved episode number are required to prepare a new episode. The user's direct request naming the chosen topic is sufficient selection; asking for ideas, a preview, or a test does not by itself request creating an episode. If a number is given for an existing episode, its verified work record supplies the confirmed topic unless the user asks to change it.

## Locate the episode

1. List direct children of the configured channel folder. Resolve the number from the request or a clearly identified existing episode. If asked for the next episode, first look for the same selected topic in active episodes to resume it; then determine the next number from a complete inventory of numbered folders. Do not assign a different number on retry after an uncertain create. If the requested number, topic, or matching folder is ambiguous, show the choices before writing.
2. Use `<channelName> - 기록 NN` for a new folder and `<channelName> - 기록 NN 작업 기록` for a new work record. Pad the number to at least two digits. Look up by episode number and verified parent, not by a global title search. Inspect the matching folder's native work record and any existing checklist or script files. If there are multiple plausible matches or a conflict with the confirmed topic, stop and report it.
3. In a preview, dry run, or test without an explicit write request, return the matched episode, evidence for reuse, missing items, and planned next action. A preview from user-supplied notes can also show the checklist and script without a connected account.

## Prepare or resume

- For an authorized new episode, create the folder directly under the verified channel folder if absent, then copy the configured native Docs template directly into that folder if its work record is absent. Confirm the copy is a different item from the source, the parent is correct, and the owner matches. Re-list before retrying a failed or uncertain creation, and resume any verified partial result. If a concurrent run produced multiple matches, stop instead of deleting or picking one.
- Read the actual work record, including the target tab and current revision, before editing. Fill the agreed topic, current status, next action, essential shots, camera settings if provided, and verified source or asset links. Preserve existing facts, progress, checked boxes, links, and the native document structure. Use scoped changes with a revision guard when the host supports it. Leave dates, footage, backups, edits, and publication fields pending unless verified or confirmed by the user.
- Draft a phone-readable checklist in the order the user will shoot: the establishing shot, essential details and actions, any repeated angle, final piece to camera, and a sound check. Keep the read-aloud script separate and mark voiceover versus camera-facing lines. Use the user's facts and chosen tone. Label proposed wording as a draft.
- Reuse an existing checklist or script when it matches the episode and verify its link. Provide missing drafts as separate sections in the work record or chat. Generate or upload separate PDFs only when requested as deliverables. For those requests, verify type, contents, phone readability, exact parent, and links before marking them complete. Do not publish or mark posting complete from a planned release.

Reopen the folder and work record after any writes. Return the episode number, verified work record and asset links, current stage, and the next action. If the existing episode already contains the requested material, return it without creating duplicate files or rewriting the record.
