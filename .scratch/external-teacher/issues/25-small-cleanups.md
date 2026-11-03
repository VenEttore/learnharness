# 25: Small cleanups from the cold-start

Status: resolved
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts or the external routes (error shape), scripts/lh.mjs, app/chat/[id]/card, docs/external-teacher.md, new tests

From the ticket 24 cold-start package and the plan redraw check (Watcher, 2026-11-02 and 2026-11-03). None blocks use. Ven chose "now" (2026-11-03, own words through the Watcher widget).

- [x] An `explain` with an invalid `type` gets a raw AJV validation dump. Return the usual `invalid` refusal with readable `problems`.
- [x] `lh show`'s `openQuestion` leaves out the lead-in `text`. Include it.
- [x] The card's "Before the question" can show an older `say` than the latest teaching. Show the latest teaching text before the open question.
- [x] The card after a plan replace: today it shows the new plan only after a reload. Make an open card pick up lesson changes by itself (the lesson page already redraws within about 3 s; reuse how it learns of changes, e.g. the chats-changed event), or, if that is not small, say why and leave it to the guide note below.
- [x] Stacked plan maps on the lesson page: a replace appends a new map and the old one stays with no "superseded" marking. Upstream does the same for its own model. Mark older maps as replaced only if it is a small, contained edit to upstream page code that ordinary lessons are fine with; otherwise record why not and leave it.
- [x] Guide: after `lh plan` replaces a plan, reload the card before reading or screenshotting it (the card is a snapshot; the lesson page redraws by itself), and tell the learner in chat that the plan changed. Don't use the plan's `version`: it stays 1 on every replace, as upstream's `plan_init` does.

Checked and not a bug: the lesson page shows a replaced plan within about 3 s without a reload; it appends the new map below the old one, as upstream does.

## Comments

### Shipped 2026-11-03
Completed:
- `invalid` from a turn's schema check now lists one plain problem per field, such as `type must be "predict" or "check", not "foo"`, in place of pi's raw dump with the payload echoed back (src/server/schema-problems.ts). An optional field sent as null reads "must not be null; leave it out", the wording the route already used. pi's own error lines are the fallback.
- `openQuestion` in `lh show` and `lh answer` carries the lead-in `text` ("" for none), as stored and joined like a message's `text`.
- The card's "Before the question" shows only this exchange's teaching. Text from before an answered or skipped question is older. When the open question has its own lead-in, that lead-in is the newest teaching and older text is left out. Without a lead-in, the latest teaching is shown. A refused call, or one from an aborted generation, does not split an exchange. Parallel questions in one message keep ticket 22's rule. The lead-in and teaching keep a leading indent, so indented code renders as code.
- An open card re-renders itself when its lesson changes. A layout for the card route (app/chat/[id]/card/layout.tsx) listens for the events the lesson page uses (record-changed and turn-settled for this lesson, plus a resync on reconnect) and calls router.refresh. The page component stays a plain snapshot.
- On the lesson page, plan maps older than the newest are dimmed under "Replaced by a later plan", in ordinary lessons too (components/replaced-plan.tsx, plus three lines in upstream components/chat.tsx).
- Guide: after a plan replace, tell the learner, reload the card before reading or screenshotting it, and compare nodes, not `version`. Also documented: the `openQuestion` shape, the per-field `problems`, and what the card shows.
- `scripts/lh.mjs` needed no change, because it passes `openQuestion` through as the server sends it.

Deferred:
- The plan `version` still stays 1 on every replace, as upstream's `plan_init` does. The guide tells the bot to compare nodes instead.
- Two review judgement calls stay as they are. `jsonType` and the null wording appear in both bot-run.ts and schema-problems.ts. replaced-plan.test.tsx copies chat.tsx's one-line `replaced` expression instead of rendering the chat view.
- No one ran an ordinary lesson with a real model rewriting its plan mid-stream, because this host has no model keys. Reviewers read that code path only.

Verified:
- Review: 3 rounds of code-review (Opus 5.5 xhigh) and interrogate (A: Opus 5.5 xhigh, C: Haiku 5.5 xhigh). Round 1 found 6 issues and round 2 found 5; all were fixed with tests that fail on the old code. Round 3 at c4b396a: code-review Pass, 0 findings from A, 0 from C.
- Live check with next dev and headless Chrome (a script kept outside the repo). With the card and the lesson page open, `lh plan` replaced the plan. The card showed "Powers of two" in 1.0 to 6.0 s over 3 runs, with 0 card fetches in 5 s idle. The lesson page had 2 maps, 1 marked replaced.
- Card screenshots retaken (card-22/retake.sh): the same report as ticket 22, width 390, nothing clipped, nothing outside the card, no controls shown, no non-GET requests.
- Repo check at the shipping tree (integration tip c39181f merged, a no-op): `npm run typecheck` and `npm run lint` clean; `NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx` gave 3180 of 3181 passing. The one failure is the baseline ("main loader resolves Pi's import-only PUBLIC package exports...").
- `bash .scratch/external-teacher/phase-c-smoke.sh 3731`: PASS, 0 FAIL lines.
- blast-radius: skipped (Risk: pre-release).
