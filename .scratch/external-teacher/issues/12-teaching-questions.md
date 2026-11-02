# 12: Teaching questions

Status: resolved
Blocked by: 11
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, scripts/lh.mjs, new test files, tests/lh-cli.test.ts, tests/bot-run-questions.test.ts

Phase C. Uses ticket 01's shared plan-node check.

**What to build:** A Bot Teacher teaches with predict and check questions, and free-recall questions, each tagged with a plan node. The page shows teaching progress on the map.

- [x] Kinds-table rows: `quiz` and `explain`, allowed in the plan and teach phases. Each uses the teaching schema (`type` and `nodeId` required), then the refinement, then the shared plan-node check.
- [x] An unknown `nodeId` is refused with the check's text.
- [x] The first tagged question moves the phase fold to teach.
- [x] A plan rewrite during the teach phase is still accepted (ticket 11's row).
- [x] `lh quiz|explain` read JSON from `--file` or stdin.

| Failure | Caller | Returns |
|---|---|---|
| Unknown plan node, or the payload fails the schema or refinement | turn | 422 `{ ok: false, code: "invalid", problems }` |
| `quiz` or `explain` before probe-done | turn | 409 `{ ok: false, code: "wrong_phase", phase, allowed }` |

## Comments

### Shipped 2026-10-31
Completed:
- Kinds-table rows `quiz` and `explain` (plan and teach phases) in `src/server/bot-run.ts`. They use the teach tools' schemas (`quizInputObject`, `explainInputObject`; `type` and `nodeId` required), then the tools' refinements, then the shared `planNodeProblem`, which the `needsPlanNode` column switches on. Refinement and node problems come back together in one 422 `invalid`, as the model's teaching tools report them. Both take optional lead-in text in the same assistant message.
- Which plan the node check reads: the tree of the latest successful plan_init in the transcript (`latestPlan`), not `record.tree`. That is the plan the page's map draws and the one `show` returns. After a failed plan commit the stored tree can be ahead of the transcript, and a question tagged with a node the map does not draw would move the map nowhere. A test pins it: with a rewrite's tree saved and its messages lost, a node only in the stored tree is refused, and a node only in the drawn plan is accepted and moves the map. Swapping the check to `record.tree` fails that test.
- The repeat check sees turns refused only by the node check. Such a refusal still carries `built`, so a retried question whose node a later rewrite dropped is answered `repeat: true` instead of 422 (interrogate round 1, seats B and C). A payload that fails the schema or refinement never carries `built`, and a refused turn is never saved.
- The first tagged question moves the phase fold to teach; the fold is unchanged. A plan rewrite during teach is still accepted, and later questions check against the new plan.
- `lh quiz|explain <id> --after <cursor>` read JSON from `--file` or stdin.
- `tests/bot-run-teaching.test.ts` (19 tests) goes through the turn, show and dismiss routes. It reads the open question the dock parses, the phase, and map progress (`derivePlanStatuses` over `projectView`). One `tests/lh-cli.test.ts` case now covers quiz and explain. The plan-phase `allowed` list in `tests/bot-run-questions.test.ts` now includes `quiz` and `explain`.

Deferred:
- For ticket 13 (the guide): with no plan yet, the node check's text says "call plan_init before posing quizzes". A bot posts the plan with `lh plan`, so the guide's tool-name mapping should cover that wording.
- Not acted on, from the code-review smells: the test harness helpers are copied into each `bot-run-*` test file (each file sets its own data dir before importing), and `lh.mjs` lists the JSON kinds in both `JSON_KINDS` and the switch's case labels. Both follow the existing pattern.

Verified:
- Red then green: the new tests and the lh-cli case failed against the integration tip's `bot-run.ts` and `lh.mjs` (18 failures), and pass on this branch. The repeat-after-rewrite test fails with check 3 reverted to `if (checked.ok)`.
- Full check at aed4a7b (the integration tip 4a10504 is already merged): `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx` ran 3086 tests, 3085 passed and 1 failed. The failure is the baseline Pi main-loader test.
- Code-review (Opus 5.5, xhigh), round 1: Standards had no hard violations. Spec flagged two partials: the refinement 422 did not assert `code` and `ok`, and the lead-in was untested on explain. Both were fixed in 57bf2db, and a Spec rerun passed. Round 2 at c225a89: both axes passed. Its comment notes were applied in aed4a7b.
- Interrogate round 1 at 57bf2db, 4 seats (Grok 4.7, GLM 5.3 Flash, Haiku 5.5, Composer 2.5). Act On: the repeat-after-rewrite refusal (B and C), fixed in c225a89. Round 2 at c225a89, the same 4 seats: Act On none. Seat B also drove `lh` end to end against a live server, and the page's answer path graded a bot-saved quiz.
- Blast-radius: skipped (Risk: pre-release).
