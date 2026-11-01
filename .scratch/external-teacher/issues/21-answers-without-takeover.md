# 21: Answers without a desktop takeover

Status: open
Blocked by: 19, 20, 22
Risk: pre-release
Gate: none
Host: linuxdev
Touches: scripts/lh.mjs, docs/external-teacher.md, GLOSSARY.md if a term is added, new test files

From ticket 15's bench (P1, P2, P3). On the bench, Ven was on a phone. The lesson page can be reached that way (Take over of the bot's desktop from a phone), but driving a desktop VM through a phone is very inconvenient. The bot asked questions in Grok Bot chat widgets and hand-built `POST /api/chat` requests to save the answers into the lesson, so `lh answer` still saw them. That path is undocumented, and once the bot graded a pick before it had the confidence. The learner's standing preference: never reveal right or wrong until the confidence is in.

**What to build (recommended design; reopen only if the code makes it unworkable):**
- [ ] A new `lh` command, e.g. `lh submit <lesson> --after <cursor>`, that saves a learner's answer exactly as the page does (same request shape to the existing page route, POST /api/chat, so the stored answer is identical to a page answer). It takes the pick(s) by index, confidence (the page's values: 0/30/50/70/90/100), optional thinking, "I don't know", and skip. For quiz and probe picks, confidence is required unless the answer is "I don't know"; a pick without it is refused before anything is sent. Read the page's answer and dismiss request shapes (tests/bot-run-answers.test.ts, tests/bot-run-page-input.test.ts, ticket 09/14 smoke scripts) and mirror them. No new server route unless the page route cannot be reused; say why if so.
- [ ] Retried `lh submit` is safe to run twice (no duplicate answer).
- [ ] Guide: a section for a learner who answers outside the page (phone, chat widgets): ask in your own channel, collect pick + confidence (+ thinking) together, never say right or wrong before the confidence is in, save it with `lh submit`, then read it back with `lh answer`. Say that picks are read and sent by index, not label. Note that the learner can still reach the lesson page from a phone through Take over, but it is slow; the out-of-page path is the convenient one. Ven's intended flow (2026-11-01): the bot screenshots the question card page (`/chat/<id>/card`, ticket 22) and sends it, the learner answers in a chat widget, the bot saves it with `lh submit`.
- [ ] Guide, from the Watcher's Grok Bot capability notes (2026-11-01): only the main Grok Bot chat agent can raise chat widgets, not its subagents or routine runs, so the Bot Teacher itself asks. Grok Bot chat does not treat a single `$` as math; when mirroring a question, teaching text or plan into chat, convert `$...$` to `\( ... \)` (display math `$$...$$` and fenced `mermaid` render as they are). The screenshot of the card shows math as the page renders it, so it needs no conversion.
- [ ] Guide, Method section: update the "no equivalent" list with the Grok Bot tools that stand in for LearnHarness tools, per the mapping in .scratch/external-teacher/grok-bot-tool-map.md (web search/fetch and subagents for `research`; image generation and mermaid in chat for `visual`; shell tools on the box for `pdf`, `find`, `ls`, `grep`, `read`). Keep it short.
- [ ] Guide: during the first compile the sidebar shows "Loading..."/"Compiling..." while the lesson works; do not restart the server for it.
- [ ] If cheap: `lh` prints a clear error when Node is older than 22.
- [ ] Tests for lh submit: one-shot pick + confidence + thinking stores the same record as the page; missing confidence refused; "I don't know" without confidence accepted; skip; retry is a repeat.
- [ ] Update phase-c-smoke.sh to cover lh submit and rerun it.
