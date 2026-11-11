# 29: Bot findings into the graph

Status: claimed
Blocked by: 28
Risk: pre-release
Gate: none
Host: linuxdev
Touches: new external route, src/server/graph-findings.ts, scripts/lh.mjs, src/agent/subagents/extraction.ts (exports and the audit-lock fix), src/core/contracts/graph.ts (the source tag), app/api/graph/status/route.ts and components/graph-view.tsx (refetch), ADR 0001, docs/architecture.md, docs/external-teacher.md, GLOSSARY.md, new tests

Option A, part 2. The bot does the extractor and auditor work; LearnHarness validates and writes through mergeFindings, as the normal path does.

- [x] `POST /api/external/chats/:id/findings` and `lh findings <lesson>`: takes `{findings, verdicts}` in the shapes the extractor and auditor return; validates with the existing validators; calls mergeFindings and the layout under the same lock; marks the messages read in the coverage file.
- [x] Every fact and chain from this route carries a source tag (e.g. external) that a later cleanup can find. Say where it is stored.
- [x] One run at a time per lesson; a rerun over already-read messages adds nothing.
- [x] ADR 0001 and docs/architecture.md: "the merger is the only writer; what it merges comes from LearnHarness's model or a bot". LearnHarness still calls no model in a bot-run lesson.
- [x] Tests: the same findings through this route and through the normal merge give the same files apart from the tag; bad shapes are refused; rerun is a no-op.

## Comments

### Stopped at review cap 2026-11-11 (status stays claimed)
Three review rounds ran, the most this launch allowed. Round 3 found five items. All five are fixed, in three commits after round 3 that total 20 changed lines outside tests. Round 3's interrogate D reviewed 96f18ad4 (3 of those lines). No round has reviewed 87703d8c or 3850dcc6, the other 17 lines. The 20 lines are at the small-diff rule's limit (pre-release, at most 20 lines outside tests). The one interface change is the status reply field, renamed from `graphRevision` to `graphDataRevision`; this ticket added that field and only the graph view reads it. No Act On item is open.

Completed:
- `POST /api/external/chats/:id/findings` and `lh findings <lesson> [--file <path>]`. The body is `{messageIds, findings, verdicts}`: the extractor's `submit_findings` payload and the auditor's `submit_review` payload. Code: src/server/graph-findings.ts (new), app/api/external/chats/[id]/findings/route.ts (new), scripts/lh.mjs.
- Validation uses the extractor's and the auditor's own schemas through pi's validator, then `validateSessionAnchors` and `validateFindingsChains`. extraction.ts now exports these with one-word `export` edits. The route also refuses unknown fields, converted values, and mergeFindings' silent cases: a repeated proposition id, a proposition id equal to an existing node id, a blank id, name or statement, a link from an unknown proposition, a link to an unknown node, a proposition linked twice, and a premise that is the conclusion once links apply.
- The server rebuilds the lesson's first unread batch from the coverage file (`unreadBatches` in graph-reads.ts, shared with extract-view). It merges only when the bot's messageIds equal that batch, and it checkpoints that batch's own slots. If every id is already read, the reply is `merged:false, alreadyRead:true` and nothing is written. Any other mismatch gets 409 `stale_batch` with the current ids.
- The merge runs inside the pipeline's process-wide audit lock (`globalThis.__lhAuditLock`), followed by `settleGraphLayout` and `activity-changed`. If the lock is held for more than 20 s, the reply is 503 `graph_busy`, and the request that gave up keeps its place in the queue until the holder ahead of it finishes.
- Round 1 found a bug in the pipeline's own `withAuditLock`. An aborted waiter released the next one while the holder was still auditing, so the route could merge mid-audit. The fix is 6 lines in extraction.ts: an aborted waiter now passes its turn on only after the holder finishes.
- The source tag is `"source": "external"` on every node line and chain line the route appends to `nodes.jsonl` and `chains.jsonl` in the graph data directory (`LEDGER_FILES` in config.ts). That covers new nodes, link lines and chains. A Proxy around the graph store writes it. The upstream record change is an optional `source?: "external"` on GraphNode and GraphChain in src/core/contracts/graph.ts. Coverage lines carry no tag; they name the lesson.
- The route refuses with 409 `graph_disabled` while `graph.enabled` is off. It checks before the lock and again inside it.
- An open graph view now refetches after a bot merge. /api/graph/status returns `graphDataRevision`, which is the ledgers' newest modification time without positions.json, and graph-view.tsx refetches when it moves.
- ADR 0001 and docs/architecture.md say the merger is the only writer of graph facts and chains, and that what it merges comes from LearnHarness's model or a bot. LearnHarness calls no model in a bot-run lesson. ADR 0001 also says removing tagged lines is not a full undo, because chain simplification may already have dropped another lesson's chain.
- Guide (docs/external-teacher.md): section 7 now covers `lh findings` and its reply fields. Section 5 lists `bad_findings`, `stale_batch`, `graph_busy` and `graph_disabled`, and gives the steps after `save_failed`. GLOSSARY.md has new entries for findings and source tag.

Deferred:
- The lesson page's coverage ring does not refresh after `lh findings`: the page's activity feed drops `graphRevision`. Ticket 30 writes the lesson-close flow and can take this.
- The graph view can miss a bot merge that lands between its first-load `/api/graph` fetch and its first status read. Upstream has the same race for run rows. The clean fix is for `/api/graph` to return its revision. That edits an upstream route, so it needs its own ticket.
- The batch check matches message ids, not text. Nothing in this build edits teacher prose. If something ever does, extract-view should return a hash of each batch and the route should require it.
- mergeFindings' chain rewrite drops ledger lines that the store's shape check rejects. This predates the ticket and is shared with the pipeline; it needs its own ticket.
- `POST /api/graph/coverage/extract` answers 202 for a bot-run lesson and does nothing. This predates the ticket; it should refuse with 409.
- An unreadable or corrupt settings.json reads as graph on, as everywhere else in the app.
- Judgement calls left as they are: the lock protocol exists in two places (extraction.ts and graph-findings.ts); the unknown-field refusal says "of this kind" (reused from the turn route); the existing-node-id refusal is broader than strictly needed; stringified arrays and nulls are refused and documented; messageIds are compared as a set; a rerun returns `alreadyRead` without re-checking.
- Question handling was not touched, so bot-run.ts's open-question gate (ticket 27's note) needs no revisit here.

Verified:
- Full repo check at 69cca6db (the tip, with feat/external-teacher merged in): typecheck passes; lint has 0 errors and 1 warning, the existing `<head>` one. 3461 of 3462 tests pass. The one failure is the baseline Pi loader test.
- tests/graph-findings.test.ts, 13 tests:
  - A parity test runs the real pipeline with scripted models over two batches, then the route over the same messages. The two ledger sets match apart from the tag, ids and timestamps.
  - 27 kinds of refused input, each checked to write nothing. The guide's own example merges.
  - Reruns, and two identical requests sent at once.
  - The audit lock, including an aborted pipeline waiter between a running audit and the route.
  - A layout failure after a landed merge, the status stamp, and both graph_disabled paths.
  - Three mutations each made the suite fail: dropping the layout settle, shifting the coverage slots, and reverting the lock fix.
- tests/lh-cli.test.ts covers `lh findings` from stdin and --file, a byte-order mark, and bad command lines. Extraction-related suites passed 119 of 119 after the lock fix, and the graph-view UI suites passed 60 of 60.
- phase-c-smoke.sh on port 3189 at 69cca6db: PASS, with 102 ok lines and 0 FAIL, at load 4.
- Review: rounds 1 to 3 each ran code-review (Opus 5.5 xhigh) and interrogate A (Opus 5.5 xhigh), B (GLM 5.3 Flash high, the fallback for the GLM seat), C (Haiku 5.5 xhigh) and D (Sonnet 5.5 high, the fallback for the Composer seat; it does not offer fastMode). Round 1 had 21 proven findings, round 2 had 11 and round 3 had 13, counting repeats across seats. All Act On items are fixed or deferred above.
- blast-radius: skipped (Risk: pre-release).
