# 25: Small cleanups from the cold-start

Status: open
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts or the external routes (error shape), scripts/lh.mjs, app/chat/[id]/card, docs/external-teacher.md, new tests

From the ticket 24 cold-start package and the plan redraw check (Watcher, 2026-11-02 and 2026-11-03). None blocks use. Matt decides now or later.

- [ ] An `explain` with an invalid `type` gets a raw AJV validation dump. Return the usual `invalid` refusal with readable `problems`.
- [ ] `lh show`'s `openQuestion` leaves out the lead-in `text`. Include it.
- [ ] The card's "Before the question" can show an older `say` than the latest teaching. Show the latest teaching text before the open question.
- [ ] Guide: after `lh plan` replaces a plan, reload the card before reading or screenshotting it (the card is a snapshot; the lesson page redraws by itself), and tell the learner in chat that the plan changed. Don't use the plan's `version`: it stays 1 on every replace, as upstream's `plan_init` does.

Checked and not a bug: the lesson page shows a replaced plan within about 3 s without a reload; it appends the new map below the old one, as upstream does.
