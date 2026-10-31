# 11: Plan

Status: resolved
Blocked by: 10
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, app/api/external/** (show), scripts/lh.mjs, new test files

Phase C. Uses ticket 01's shared `plan_init` result and plan input schema.

**What to build:** A Bot Teacher posts the lesson plan as a Mermaid diagram. The owner sees the plan map and the in-lesson plan block. A broken plan is refused and saves nothing.

- [x] Kinds-table row: `plan`, allowed in the plan and teach phases. It runs the plan input schema, then the Mermaid parser, then the tree builder.
- [x] Parser problems and `PlanTreeError` (for example a cycle or a duplicate id) return the problem text. Neither the tree save nor the message save runs.
- [x] On success, the tree is saved first with the store's tree save. Then one commit, through the commit helper, writes three things: the `plan_init` call, the shared result carrying the tree (joined by id), and the plan-block markers built the way the existing turn persist builds them.
- [x] The page's plan map reads the tree from the result, and the plan-block markers are present. Tests go through the view projection.
- [x] `lh show`'s `plan` is the latest successful plan in the transcript.
- [x] A later `plan` (a rewrite) is accepted and replaces the tree.
- [x] Crash repair: with the tree saved and the messages missing, a rerun saves the messages and is not treated as a repeat.
- [x] `lh plan` reads Mermaid text from `--file` or stdin.

| Failure | Caller | Returns |
|---|---|---|
| Mermaid doesn't parse, or the tree is invalid | turn | 422 `{ ok: false, code: "invalid", problems }` |
| `plan` before probe-done | turn | 409 `{ ok: false, code: "wrong_phase", phase, allowed }` |

## Comments

### Shipped 2026-10-31
Completed:
- Kinds-table row `plan` (plan and teach phases) in `src/server/bot-run.ts`. It runs plan_init's input schema, then `parseMermaidPlan`, then `createTree` (`planTreeOf`). Parser problems and `PlanTreeError` come back as 422 `invalid` with the problem text. Neither save runs.
- On success the row builds the `plan_init` call, `planInitSuccessResult` joined by call id, and the plan-block marker from `planBlocksFor`, as the turn persist builds it. `Built` is now `{ records, saveFirst? }`. The tree save is `saveFirst`, and `commitOrFail` runs it after every check, just before the one commit.
- `build` now receives the lesson record (it used to get only the chat id), because the plan block's snapshot reads the transcript.
- A rewrite replaces the tree and gets its own block. Trailing line breaks are trimmed from the Mermaid, as for `say`, so a `--file` rerun of a piped plan counts as a repeat.
- Crash repair needed no special code. With the tree saved and the messages missing, no call follows `after`, so the rerun is not a repeat and it saves both.
- Ticket 03's deferred "a `build` that throws": a throw in a row's check or build is now a JSON 500 `internal_error` with the cursor, and nothing is saved. A throw in the tree save or the commit is the existing JSON 500 `save_failed`.
- Show's `plan` is the tree of the latest successful plan_init result in the transcript, or null.
- `lh plan <id> --after <cursor>` reads Mermaid from `--file` or stdin.
- `tests/bot-run-plan.test.ts` (12 tests) reads the plan map through `latestTree(projectView(...))` and the block through the view. One case in `tests/lh-cli.test.ts` is new. The wrong_phase `allowed` list in `tests/bot-run-questions.test.ts` now includes `plan`.

Deferred:
- The ticket's "duplicate id" example has no refusal behind it, and none was added. The Mermaid parser merges a repeated node id into one node, and the first title wins: that is how edges reference a node. The parser also handles self-loops, bad slugs and duplicate edges before the tree builder runs. Through Mermaid, the only `PlanTreeError` left is a cycle. The tests cover a two-node cycle, a three-node cycle, a self-loop (as the parser's line problem), and a repeated id that merges. The guide (ticket 13) should not promise a duplicate-id refusal.
- Interrogate seat C showed that a write cut off partway through can truncate the chat file and make the lesson unreadable (simulated ENOSPC mid-write). The cause is `writeChat` in `src/store/chats.ts`, which is a plain `writeFileSync`. That predates this ticket, covers every save path (the control case was a `say`), and is an upstream file outside Touches. The fix is to write to a temp file and rename it, as `src/store/graph.ts` and `src/store/auth.ts` already do. Proposed as a new ticket. Not filed.
- From the code-review smells, not acted on: `planTreeOf` repeats the plan_init tool's validation steps, and `latestPlan` repeats the page's latestTree check. Both stay in fork files to keep upstream edits small. The test harness helpers are copied across the `bot-run-*` test files.
- After a failed commit, `record.tree` can be ahead of the transcript until the rerun lands. This is the settled crash-repair window. It matters for ticket 12 if quiz `nodeId` checks read `record.tree`.

Verified:
- Red then green: `tests/bot-run-plan.test.ts` and the new lh-cli case failed against the integration tip's `bot-run.ts` and `lh.mjs` (9 failures), and pass on this branch.
- Full check after merging the integration tip (79079dc): `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx` ran 3067 tests, 3066 passed and 1 failed. The failure is the baseline Pi main-loader test.
- An earlier full run also failed `custom-provider-restart`, a spawnSync ETIMEDOUT under host load. It passed when rerun alone.
- Code-review (Opus 5.5, xhigh), round 1: Standards had no hard violations. Spec flagged one partial: the `internal_error` path had no test. A test was added in c9d4cea.
- Interrogate round 1 at c9d4cea: 4 seats (Grok 4.7, GLM 5.3 Flash, Haiku 5.5, Composer 2.5). Act On: none. Seat C's torn-write finding was dropped as pre-existing and deferred (above).
- Blast-radius: skipped (Risk: pre-release).
