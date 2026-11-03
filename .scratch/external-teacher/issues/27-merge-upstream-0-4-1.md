# 27: Merge upstream 0.4.1

Status: resolved
Blocked by: 26
Risk: pre-release
Gate: none
Host: linuxdev
Touches: everything upstream changed (131 files); conflicts predicted in components/chat.tsx and src/agent/tools/probe.ts

Upstream main (e69e852, release 0.4.1) is 63 commits ahead of the fork's base. It tuned the extraction prompts and duplicate checker the bot-run graph work (28-30) will copy. Matt chose to start the graph work (2026-11-03); this merge goes first.

- [x] Merge upstream/main into the ticket branch with a merge commit (no rebase, no squash). Resolve components/chat.tsx and src/agent/tools/probe.ts keeping both upstream's change and the fork's (the "Replaced by a later plan" wrapper from 25; whatever the fork changed in probe.ts, found with git log).
- [x] Check every file the fork edits upstream still behaves: chat.tsx, question-dock.tsx, input-events.ts, src/store/chats.ts, extraction.ts (ticket 08's driver check still returns before any model call), core/index.ts.
- [x] The full check and phase-c-smoke.sh pass; the card's retake.sh still reports 390 with nothing clipped. Note any new upstream baseline failures, run against upstream/main alone, so they are not blamed on the fork.
- [x] AGENTS.md keeps the fork section below the Next.js block.

## Comments

### Shipped 2026-11-03
Completed:
- Merged upstream/main (e69e852, release 0.4.1) with a real merge commit, d69f8e72. Two files conflicted.
  - components/chat.tsx: the Composer takes upstream's draft model (`value={textRef.current}`, `revision`, `onChange={recordComposerText}`) and keeps the fork's `busy={turnBusy}` from ticket 04.
  - src/agent/tools/probe.ts: keeps the fork's `probeDoneSuccessResult` import from ticket 25 and takes upstream's `hasUnresolvedQuestion` gate.
- Git merged the other 17 fork-edited upstream files on its own. Each one's fork-only lines match the fork's diff before the merge, line for line. extraction.ts still checks `record.driver` before `refuseIfStagesUnready()` and before any model job. Upstream did not touch AGENTS.md, so the fork section stays below the Next.js block, byte for byte.
- Upstream 0.4.1 changed what counts as an open question. `pendingQuestionOf` and `danglingQuestionOf` now return only a question whose input parses. A question that fails to parse is "malformed", and the page shows it in its own box with a Retry button. Two fork changes follow from this:
  - tests/render-bot-run-lesson.test.tsx: the dismissal test's quiz had only a `question` string, which now counts as malformed. It now has options, a correct answer and an explanation (dc795fe4).
  - src/core/question-card.ts: the card said "No open question" where the page shows its malformed box. `questionCardOf` now falls back to `malformedQuestionsOf` and sets `malformed`. Its teaching is the same as before the merge (1c2c314e). New test: tests/question-card-malformed.test.ts. Round-1 interrogate A and C both found this. Round-2 code-review found the file header still described the old meaning, and 0f946aca rewords it.
- Merged the local feat/external-teacher tip (2bfba9e0, a STATE.md change) into the branch (7c3754cb).

Deferred:
- bot-run.ts still uses `danglingQuestionOf` for its `open_question` gate, and `handleBotRunInput` does not refuse upstream's new `retry-question` input by name. Neither can matter today: the bot route checks every question with the same schemas and rules the page uses, so a bot cannot write a malformed question, and `retry-question` returns 400 when no malformed question exists. If ticket 28-30 lets a bot write anything looser, switch the gate to `hasUnresolvedQuestion` and refuse `retry-question` in `handleBotRunInput`. Not filed as a ticket.
- When a model-run lesson's open question is malformed and has a lead-in, the card leaves the lead-in out and shows older teaching. The card did the same before the merge (interrogate A ran both versions). Dropped, because the merge did not change it. A bot-run lesson cannot reach it.

Verified:
- Repo check at 7c3754cb (`npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`, after `npm ci` on the merged lockfile): typecheck and lint pass, and 3435 of 3436 tests pass. The one failure is "main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network", the fork's existing baseline failure.
- Upstream baseline: the same check on a separate worktree at upstream/main e69e852 alone ran 3187 tests, and only that same Pi loader test failed. Upstream 0.4.1 brings no other failures.
- phase-c-smoke.sh on port 3100 at 7c3754cb: PASS, with 102 ok lines and 0 FAIL. That includes "the server log shows no model turn and no error".
- card-22/retake.sh at 7c3754cb: all nine cards are 390 wide and nothing is clipped. The new PNGs differ from the committed ones only in option order, because quiz options are shuffled per question id. I restored the committed PNGs.
- Review rounds 1 and 2. Each round ran code-review (Opus 5.5 xhigh), interrogate A (Opus 5.5 xhigh) and interrogate C (Haiku 5.5 xhigh) on the fork-on-upstream part of the diff. Round 1 found the card's malformed state, which 1c2c314e fixes. Round 2 found only the stale header comment, which 0f946aca rewords. Neither round found a bot-run lesson that reaches a LearnHarness model call, through `retry-question`, compaction, the jobs pump, extraction or source deletion. A 1,500-payload fuzz found no question the bot route accepts that upstream counts as malformed. Round 3 did not run: 0f946aca changes only 2 comment lines, so the small-diff rule covers it.
- Seats skipped: GLM 5.3 Flash and Composer 2.5, because Cursor usage is limited until 2026-11-19.
- blast-radius: skipped (Risk: pre-release).
