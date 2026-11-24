# Ticket 32 interrogate brief (round 1)

Scope (code): `git diff feat/external-teacher...<SHA named in your launch message>`. Ticket `.scratch/external-teacher/issues/32-refuse-bot-chains.md`. Files under `.scratch/external-teacher/32/` are round notes, not part of the change.

Intent: Bot Teachers wrote knowledge-graph chains whose premises do not give the conclusion, and broke two written rules against it. The fix is structural: POST /api/external/chats/:id/findings refuses any request whose findings.chains is non-empty (400 `chains_not_accepted`, before any write; `"chains": []` still merges). `lh extract-view`'s `method.extractor` tells a reader that follows only `method` to send `"chains": []` (a note at the head of the instructions, and `maxItems: 0` plus the note on the schema's chains field), without touching upstream constants. Merge and alreadyRead replies carry the whole lesson's `newFacts` (equal to the lesson's `propositions` in `lh graph sessions`), `linkedFacts` (equal to the `links` entries the lesson's merges wrote) and `learnerLine`, a ready sentence for the learner. Guide section 7, glossary, ADR 0001 and smoke 9c follow.

Settled decisions (do not relitigate):
- The external findings route refuses bot chains (Ven/Matt, 2026-11-24). No model-based entailment check.
- LearnHarness's own extraction keeps writing chains.
- Upstream files (src/agent/subagents/extraction.ts etc.) stay untouched; fork logic lives in fork files.
- ADR 0001: bot-run lessons write native records through the merger (mergeFindings).
- A missing `chains` field stays refused as bad_findings (schema requires it).

Hardware: none. Machine writers: none (the smoke starts a `next dev` server on a port you choose, with LH_DATA_DIR in a temp dir; tests use a temp graph dir). Live paths: LearnHarness's data dir defaults to the user's home data; tests and the smoke set LH_DATA_DIR to a temp dir. Any probe you write must set LH_DATA_DIR to a `mktemp -d` dir inside your worktree before importing app modules (see tests/graph-findings.test.ts for the pattern) and confirm it.

Repo check (docs/agents/check.md): `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`. Baseline: exactly one failure, "main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network". Run `npm ci` first if node_modules is missing; never symlink it. The host is a shared 4-core box: if `uptime` shows a 1-minute load over 12, wait. The full suite is optional; at least run tests/graph-findings.test.ts and tests/graph-reads.test.ts.

Shell rules: never `rm` on `$(...)`, variables or globs; make scratch with `mktemp -d`; stop only processes you started.

Prior findings: see `.scratch/external-teacher/32/code-review-r1.md` (code-review round 1 and dispositions).
