---
name: find-topics
description: "Find up to three grounded video diary ideas from a configured topic inbox or user-supplied notes, and identify ideas that already belong to an episode. Use for 소재 뽑아줘, /video-journal:find-topics (Claude Code), or $video-journal:find-topics (Codex)."
---

# Find video diary topics

Use [channel settings and Drive identity](../../references/drive.md) for any Drive access. Read only the input the user supplied or the configured topic inbox. An unqualified request to find ideas can use the inbox; an explicit source or period narrows the review. Read the channel's episode folder listing and inspect only relevant work records when checking whether an idea is already in production.

In an inbox, identify the section holding source notes, such as `새 메모`. A heading, input-format placeholder, example, or previous candidate is not a new source note. Skip entries marked reviewed and use dates or IDs when present. If the input is empty, the section is ambiguous, or the relevant read failed, distinguish those cases. Do not draw on other conversations, accounts, or files to fill a gap.

For each distinct source event or proposed activity, look for a concrete scene the user could film and a question they could answer on camera. Compare the scene and the question to the existing candidates and relevant episodes. The same location or broad topic can support a new idea when the event and question are different.

Return up to three new candidates across these statuses:

- **NOW · 지금 촬영 가능** — The event or condition is supported by the note, and there is a concrete shot the user can take now.
- **LATER · 조건이 맞으면 촬영** — The note describes a future event or an unconfirmed idea. State the condition that would make it filmable.
- **EXISTING · 기존 회차** — Point to the verified episode or candidate. Do not count it as a new candidate.
- **NO CANDIDATES · 후보 없음** — There are no distinct, grounded candidates in the available notes. State whether the inbox had no new notes or whether the notes lacked a filmable scene.

For each new candidate give its source note or a brief attributed paraphrase, working title, first shot, one question for the user, and status. Quote only wording actually present in the source. Present new phrasing as a proposed title, question, or script line rather than attributing it to the user. Rank by what the user can film and what the scene reveals about this point in their life.

Return the result in chat by default. Save only when the user has authorized writing to the exact configured inbox. Read the current revision, match the candidate section and source notes, and check for equivalent entries before appending. Preserve existing notes and candidates. When the user has authorized marking reviewed notes, record that in the same revision-guarded edit as the result, using unambiguous source anchors. Skip a repeat write if that source and outcome are already recorded. On a revision conflict or ambiguous section, reopen and reconcile before writing; return the result in chat if a scoped update cannot be verified. Read back saved entries before reporting a write.
