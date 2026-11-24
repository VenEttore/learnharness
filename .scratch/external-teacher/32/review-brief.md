# Ticket 32 review brief

Review range: `git diff feat/external-teacher...HEAD` (nothing uncommitted). Ticket: `.scratch/external-teacher/issues/32-refuse-bot-chains.md` (read it fully, including its Diagnosis and the Implementation comment). Files under `.scratch/external-teacher/32/` are round notes, not part of the change.

Settled decisions (do not reopen):
- Ven/Matt chose (2026-11-24) that the external findings route refuses bot chains. No model-based entailment check.
- LearnHarness's own extraction path keeps writing chains.
- Upstream files (src/agent/subagents/extraction.ts and other upstream code) stay untouched; fork logic lives in fork files (src/server/graph-findings.ts, src/server/graph-reads.ts are fork files).
- ADR 0001: bot-run lessons write native records through the merger.

Context: docs/external-teacher.md section 7 (the Bot Teacher guide), ticket 30's file `.scratch/external-teacher/issues/30-graph-guide-lesson-close.md` (Bench 1 and Bench 2 comments), src/core/graph.ts (mergeFindings, graphSessionIndex), src/core/graph-deletion.ts.

Checks already run (1026ae70, then again on the round-1 fixes: tests 3497, pass 3496, fail 1, the same baseline test):
- `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`: tests 3495, pass 3494, fail 1 (baseline: "main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network").
- `bash .scratch/external-teacher/phase-c-smoke.sh <port>` with CLAUDE*/AI_AGENT env vars unset: last line PASS.

Prior findings: `.scratch/external-teacher/32/code-review-r1.md` (round-1 findings, all fixed at f09a1742; check each fix is right and look for anything new).
