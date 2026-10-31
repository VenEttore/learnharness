# 08: Extraction never runs for a bot-run lesson

Status: resolved
Blocked by: 05
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/agent/subagents/extraction.ts, new test files

Phase B.

**What to build:** Knowledge-graph extraction never calls a model for a bot-run lesson, whether it starts from the manual extract button or an automatic trigger.

- [x] Extraction returns `{ nodes: 0, chains: 0 }` for a bot-run lesson, before its "models not configured" check.
- [x] A test with an extraction engine that throws if called shows it is never called for a bot-run lesson. A test of the manual extract route on a bot-run lesson shows the same.
- [x] The background job sweep: record in this ticket's Comments why it cannot act on a bot-run lesson (a bot-run lesson starts no jobs). Add a test if the sweep takes an injectable engine.

## Comments

### Background job sweep
The sweep (`recoverStaleJobs` in src/server/jobs.ts) only re-delivers or re-spawns existing job records. Jobs are created only by `src/agent/tools/jobs.ts`, inside a LearnHarness model turn. A bot-run lesson never runs one: the chat handler returns early into server/bot-run.ts, which never touches the job store. So a bot-run lesson has no jobs for the sweep to act on. The sweep takes no injectable engine (it re-spawns through `setJobRespawn`), so there is no sweep test.

### Shipped 2026-10-31
Completed: `runExtraction` returns `{ nodes: 0, chains: 0 }` for a lesson with any `driver`, right after the record read and before the models-not-configured check (3 lines in src/agent/subagents/extraction.ts). It checks `record.driver` directly, the same test as `isBotRun`, because importing server/bot-run.ts would pull server singletons into the agent layer.
Completed: tests/bot-run-extraction.test.ts. A pipeline whose `engineFor` throws returns empty for a bot-run lesson and never calls it, and writes no coverage or usage. With no model configured, a bot-run lesson is not refused. The real manual extract route on a bot-run lesson starts a run that ends empty. Controls show an ordinary lesson still reaches the engine, and the route still refuses it for the missing model.
Deferred: none.
Verified: the new tests failed 3 of 5 with the guard removed (the 2 controls passed) and passed 5 of 5 with it. Full check (`npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx`): 3011 of 3012 pass. The one failure is the baseline Pi main-loader test. Blast radius skipped: Risk pre-release. Review skipped under the small-diff rule: 3 changed lines outside tests, no interface change.
