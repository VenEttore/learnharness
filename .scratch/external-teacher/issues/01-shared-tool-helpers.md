# 01: Shared tool-result builders and plan-node check (prefactor)

Status: resolved
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/agent/tools/probe.ts, src/agent/tools/plan.ts, src/agent/tools.ts, a new shared helper module under src/core, new test file

Phase A.

**What to build:** The `probe_done` success result, the `plan_init` success result, and the check that a teaching question's plan node exists in the lesson's plan all come from one shared place. LearnHarness's tools call it now; the bot-run code calls it later. No behavior change.

- [x] `probe_done`'s success result (text and details) comes from a shared helper the tool calls.
- [x] `plan_init`'s success result (text, node-id reminder, details carrying the tree) comes from a shared helper the tool calls.
- [x] The plan input schema and the plan reminder text are exported.
- [x] The plan-node check the teaching `quiz` and `explain` tools run lives in the shared module, and the tools import it.
- [x] A new test pins each helper's output to what the tool returned before the move.
- [x] Existing probe-done, plan-block, plan-tree and question-tool tests pass unchanged.
- [x] The repo check passes (`docs/agents/check.md`).

## Comments

### Shipped 2026-10-30
Completed:
- `src/core/teaching-tool-results.ts` exports `probeDoneSuccessResult`, `planInitSuccessResult`, `planInitInputSchema`, `PLAN_NODE_IDS_REMINDER`, `planNodeProblem` and the `TeachingToolSuccess` type. Helper `details` types build on `ProbeDoneResult` and `PlanToolResult`.
- `probe_done`, `plan_init`, and the teaching `quiz` and `explain` tools call the shared helpers. The tools keep their refusal paths. `nodeIdProblem` in `src/agent/tools.ts` reads the live tree and calls `planNodeProblem`, because core may not read the chat store.
- `tests/teaching-tool-results.test.ts` pins each helper to the pre-move output as fixed literals, at three levels: the helper's return, the `toToolResult` record, and the live tool. It also pins plan_init's serialized schema to its pre-move JSON, the exact quiz/explain refusal, and the five- and six-node slug lists.
Deferred:
- A shared function that maps `{text, details}` to the stored tool-result record, for a writer that skips `serverExecute`, goes to the bot-run ticket that writes those records. `TeachingToolSuccess`'s comment names the mapping it must mirror (`toToolResult`, text-only branch).
Consider:
- Move `PROBE_DONE_ACK_TEXT` into the shared module: deferred. It already has one definition, and moving it edits an upstream contract file outside Touches.
- Retype `toToolResult`'s text-only branch so it doesn't rely on the `isImageResult` duck check: deferred to the bot-run ticket. `src/agent/tool-execute.ts` is outside Touches, and the new tests fail if that branch changes.
- Test cleanup through `chatStore.deleteChat` instead of unlinking files: deferred. It matches the sibling tests' existing pattern.
- Consider items from interrogate rounds 1–3 marked "now" were done: comment fixes, typed and schema-checked test inputs, the five-node case, exact refusal assertions, and the shared plan text constant.
Verified:
- `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx` after merging the integration tip (22bcfb1): typecheck and lint clean. 2952 tests, 2951 pass. The one failure is the baseline entry ("main loader resolves Pi's import-only PUBLIC package exports…").
- The new test failed (module missing) before the module existed, then passed. A mutation check, editing the schema description and changing the slug cutoff to `>= 5`, failed the schema-pin and five-node tests; the file was restored.
- Existing tests are unchanged: the diff under `tests/` is only the new file.
- Review: code-review passed in rounds 1 (after one fix), 2 and 3. Interrogate returned Act On items in rounds 1 and 2, all applied, and none in round 3. Blast-radius skipped: Risk pre-release.

