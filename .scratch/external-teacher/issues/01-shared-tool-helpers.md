# 01: Shared tool-result builders and plan-node check (prefactor)

Status: open
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/agent/tools/probe.ts, src/agent/tools/plan.ts, src/agent/tools.ts, a new shared helper module under src/core, new test file

Phase A.

**What to build:** The `probe_done` success result, the `plan_init` success result, and the check that a teaching question's plan node exists in the lesson's plan all come from one shared place. LearnHarness's tools call it now; the bot-run code calls it later. No behavior change.

- [ ] `probe_done`'s success result (text and details) comes from a shared helper the tool calls.
- [ ] `plan_init`'s success result (text, node-id reminder, details carrying the tree) comes from a shared helper the tool calls.
- [ ] The plan input schema and the plan reminder text are exported.
- [ ] The plan-node check the teaching `quiz` and `explain` tools run lives in the shared module, and the tools import it.
- [ ] A new test pins each helper's output to what the tool returned before the move.
- [ ] Existing probe-done, plan-block, plan-tree and question-tool tests pass unchanged.
- [ ] The repo check passes (`docs/agents/check.md`).
