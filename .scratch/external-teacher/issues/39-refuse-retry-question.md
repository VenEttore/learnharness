# 39: Refuse retry-question in bot-run lessons

Status: resolved
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts (handleBotRunInput), tests/bot-run-page-input.test.ts, docs/external-teacher.md if it lists refused inputs

From ticket 35's handoff (and deferred since ticket 27). Matt chose (2026-11-26): refuse it.

`handleBotRunInput` refuses `continue` and `retry` for a bot-run lesson with 422 `bot_run_lesson`, before any model check. The page can still send `retry-question` (re-issue a malformed open question) for a bot-run lesson. No model runs today, and the bot route refuses malformed questions, so it is near-unreachable, but it is the one page input not refused the same way.

- [x] `handleBotRunInput` refuses `retry-question` for a bot-run lesson with the same 422 `bot_run_lesson` shape, before anything is written. Find the check the code uses for `continue` and `retry` and extend it; do not add a second gate.
- [x] Say what the page shows when this 422 comes back (the same as for `continue`?). If the page would show a broken state, note it; do not redesign the page.
- [x] Tests: `retry-question` on a bot-run lesson gets 422 and writes nothing; on an ordinary lesson it behaves as before.
- [x] Search the guide and ADR 0001 for the list of refused inputs and add it where they list them.

## Check

Repo check (typecheck, lint, full tests; baseline one failure, the Pi loader test) and `bash .scratch/external-teacher/phase-c-smoke.sh <port>` PASS.

## Comments

### Shipped 2026-11-26

Completed:
- `handleBotRunInput` (src/server/bot-run.ts) refuses `retry-question` in the same switch case as `continue` and `retry`: 422 `{ error, code: "bot_run_lesson" }`, before `inputAppends` or any write. There is no second gate. The message reads "A bot-run lesson has no model turn to re-ask a question."
- Tests (tests/bot-run-page-input.test.ts): on a bot-run lesson with a live malformed question, `retry-question` gets 422 with that body, builds no agent, leaves the record unchanged and emits no record or sidebar event. A stale occurrence also gets 422. On an ordinary lesson a stale occurrence still gets the recovery check's 400, and a live one passes it and reaches the 503 `models_not_configured` gate. The bot-run test failed with 200 before the fix.
- What the page shows on this 422: the same as for `continue` and `retry`. components/session-core.ts unwraps the error text only for a 400, so the banner reads `Something went wrong: {"error":"A bot-run lesson has no model turn to re-ask a question.","code":"bot_run_lesson"}`. The status becomes `error`. The "Retry question" box stays (chat.tsx does not gate it on `botRun`), and every click gets the same 422. The learner is not stuck: typed text still saves, the next send clears the banner, and a new bot message replaces the box. This is untidy but not broken, so no page change was made, as the ticket asked. Reach is near zero: seat A sent 20 edge-case question payloads to the bot route and none was stored as malformed.
- Docs: neither docs/external-teacher.md nor ADR 0001 lists refused page inputs (ADR 0001:20 mentions only the page's automatic `continue`), so neither changed. The spec lists them; .scratch/external-teacher/spec.md lines 82 and 178 now name `retry-question` too.
- Review fix: the refusal message no longer reads "no model turn to retry-question". (mechanism: refusal-message-wording)
- Review fix: the ordinary-lesson test checks the 503's `models_not_configured` code, not only the status. (mechanism: test-asserts-status-only)
- Review fix: added the stale-occurrence case for bot-run lessons. (mechanism: test-missing-stale-case)
- Review fix: spec.md wording updated. (mechanism: stale-spec-wording)

Deferred:
- Page polish for this 422 (raw JSON banner, Retry box still offered on a bot-run lesson). Two options, both small: (a) unwrap `error` for a 422 `bot_run_lesson` at session-core.ts:743, which also tidies `continue` and `retry`; (b) hide the box's retry control when `botRun` at chat.tsx:1599. Not done: the ticket said note it, and both touch upstream files that ticket 36 merges near. For Matt to pick or drop; no ticket opened.
- .scratch/external-teacher/STATE.md:27 still calls the retry-question refusal open. STATE.md belongs to the orchestrator; left for it.
- For ticket 36: seat A saw that branch external-teacher-36-upstream-0-6-1 adds three page input types (`plugin-question-answer`, `plugin-problem-submission`, `dismiss-plugin-question`). `handleBotRunInput`'s switch does not list them, so on a bot-run lesson they would go to `inputAppends`. Check that at 36's merge. Not run.

Verified:
- Review: one round. Code-review (claudeAgent claude-opus-5-5 xhigh, fastMode false): 0 important, 3 nits, 1 pre-existing (the page state above). Interrogate seat A (claude-opus-5-5 xhigh): 0 important, 2 nits. Seat C (claude-haiku-5-5 xhigh): 1 important (the raw-JSON banner), 3 nits. I read C's important as the page-state note: the same banner already shows for `continue` and `retry`, the learner can recover, and the ticket asked for a note, not a page change. Seats B and D were skipped for this small fix by the parent's choice. All seats read ac5d862c. The round-1 fixes (4 lines outside tests, no new interface) shipped without a second round.
- `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx` on the final tree (ac5d862c plus the round-1 fixes in this commit), linuxdev, after `npm ci` in this worktree: typecheck and lint pass; 3500 tests, 3499 pass, 1 fail (the baseline Pi loader test, `No "exports" main defined` in @earendil-works/pi-ai). One run; the same result at ac5d862c. `tests/bot-run-page-input.test.ts` alone: 13/13.
- `bash .scratch/external-teacher/phase-c-smoke.sh 3139` on the same tree: PASS, 117 ok lines, 0 FAIL, no upgrade notice. Also PASS 117 at ac5d862c. `next dev` rewrote AGENTS.md during the smoke; restored before commit.
- Blast radius: skipped, pre-release (Risk: pre-release).
