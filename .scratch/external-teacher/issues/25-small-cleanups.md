# 25: Small cleanups from the cold-start

Status: claimed
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts or the external routes (error shape), scripts/lh.mjs, app/chat/[id]/card, docs/external-teacher.md, new tests

From the ticket 24 cold-start package and the plan redraw check (Watcher, 2026-11-02 and 2026-11-03). None blocks use. Ven chose "now" (2026-11-03, own words through the Watcher widget).

- [ ] An `explain` with an invalid `type` gets a raw AJV validation dump. Return the usual `invalid` refusal with readable `problems`.
- [ ] `lh show`'s `openQuestion` leaves out the lead-in `text`. Include it.
- [ ] The card's "Before the question" can show an older `say` than the latest teaching. Show the latest teaching text before the open question.
- [ ] The card after a plan replace: today it shows the new plan only after a reload. Make an open card pick up lesson changes by itself (the lesson page already redraws within about 3 s; reuse how it learns of changes, e.g. the chats-changed event), or, if that is not small, say why and leave it to the guide note below.
- [ ] Stacked plan maps on the lesson page: a replace appends a new map and the old one stays with no "superseded" marking. Upstream does the same for its own model. Mark older maps as replaced only if it is a small, contained edit to upstream page code that ordinary lessons are fine with; otherwise record why not and leave it.
- [ ] Guide: after `lh plan` replaces a plan, reload the card before reading or screenshotting it (the card is a snapshot; the lesson page redraws by itself), and tell the learner in chat that the plan changed. Don't use the plan's `version`: it stays 1 on every replace, as upstream's `plan_init` does.

Checked and not a bug: the lesson page shows a replaced plan within about 3 s without a reload; it appends the new map below the old one, as upstream does.
