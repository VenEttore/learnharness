# 08: Extraction never runs for a bot-run lesson

Status: claimed
Blocked by: 05
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/agent/subagents/extraction.ts, new test files

Phase B.

**What to build:** Knowledge-graph extraction never calls a model for a bot-run lesson, whether it starts from the manual extract button or an automatic trigger.

- [ ] Extraction returns `{ nodes: 0, chains: 0 }` for a bot-run lesson, before its "models not configured" check.
- [ ] A test with an extraction engine that throws if called shows it is never called for a bot-run lesson. A test of the manual extract route on a bot-run lesson shows the same.
- [ ] The background job sweep: record in this ticket's Comments why it cannot act on a bot-run lesson (a bot-run lesson starts no jobs). Add a test if the sweep takes an injectable engine.
