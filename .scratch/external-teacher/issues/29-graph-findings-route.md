# 29: Bot findings into the graph

Status: resolved
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
- The lesson page's coverage ring does not refresh after `lh findings`: the page's activity feed drops `graphRevision`. Moved to ticket 30.
- The graph view can miss a bot merge that lands between its first-load `/api/graph` fetch and its first status read. Upstream has the same race for run rows. The clean fix is for `/api/graph` to return its revision. Now ticket 31.
- The batch check matches message ids, not text. Nothing in this build edits teacher prose. If something ever does, extract-view should return a hash of each batch and the route should require it.
- mergeFindings' chain rewrite drops ledger lines that the store's shape check rejects. This predates the ticket and is shared with the pipeline; it needs its own ticket.
- `POST /api/graph/coverage/extract` answers 202 for a bot-run lesson and does nothing. This predates the ticket; it should refuse with 409.
- An unreadable or corrupt settings.json reads as graph on, as everywhere else in the app. (Fixed for this route in the next launch: it now refuses with `settings_unreadable`.)
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

### Shipped 2026-11-14
This launch fixed the settings guard and ran review round 4, the last round left. The round found no Act On item at 7a92b674. Interrogate C found two at d01fd084, both in the graph view's revision stamp. Both are fixed with tests. The fixes after C and D's commit add 11 lines and remove 4 outside tests, add no interface, and no seat read them. They ship under the small-diff rule. Counted from 7a92b674, the commit that code-review, A and B read, the fixes add 16 lines and remove 7.

Completed:
- The findings route refuses with 500 `settings_unreadable` when settings.json exists but its graph switch cannot be read. That covers an unreadable file, a file that is not JSON, a top level that is not an object, a `graph` section that is not an object, a switch that is not true or false, and a link to a missing file. A missing file is first boot and reads as the factory default, graph on. The check runs before the audit lock and again inside it. It lives in `switchRefusal` in src/server/graph-findings.ts. Upstream's settings reading in src/store/settings.ts is unchanged. Guide section 5 lists the code: skip findings, tell the learner, and resend the batch once the file is fixed.
- `graphDataRevision`, the number /api/graph/status returns for the graph view, is now the sum of each ledger's modification time and size, not the largest time. A merge now moves it even when another ledger's time is in the future. It reads each file with one `statSync` call and treats a missing file as 0, so a ledger deleted mid-read no longer makes the status route fail. The name and the type (a number) are unchanged, and the view still compares with `!==`.
- Round 4 small fixes: the guide gave the tagged lines as `data/graph/...`, and now names `graph/nodes.jsonl` and `graph/chains.jsonl` in `LH_DATA_DIR`. A code comment now names `graphDataRevision`. The `settings_unreadable` row also covers a switch that is not true or false.

Deferred:
- Lesson page coverage ring not refreshing after `lh findings`: ticket 30.
- Graph view missing a bot merge between its first `/api/graph` fetch and its first status read: ticket 31.
- Removing bot-tagged lines is not a full undo: stays a note in ADR 0001.
- The chain rewrite dropping lines that fail the store's shape check, and `POST /api/graph/coverage/extract` answering 202 for bot-run lessons: both predate the fork and stay notes.
- Kept as they are after round 4: `graph: null`, `"enabled": null`, an empty file and a byte-order mark before valid JSON all get `settings_unreadable`, though upstream reads them as graph on. That is the safe direction. A batch with no facts marks coverage, which moves the stamp and costs the view one extra refetch. After `save_failed`, a resend that repeats a landed fact under its `p` id adds it twice. The guide's recovery steps prevent that.
- Not a defect: interrogate C said extract-view ignores the learner's `extractionChunkTokens`. Nothing in the server passes `getChunkTokens` to the pipeline, so LearnHarness's own extractor also batches at the factory 4096 tokens, and the guide's wording is accurate.
- Unverified: the new settings tests create a symlink and a directory at the settings path. They ran only on Linux, and creating a symlink on Windows may need extra privileges.

Verified:
- Full repo check at 609e67d5, the tip with feat/external-teacher (813c9840) merged in: typecheck passes. Lint has 0 errors and 1 warning, the existing `<head>` one. 3471 of 3472 tests pass. The one failure is the baseline Pi loader test.
- tests/graph-findings.test.ts passes 23 of 23. These new tests failed on the code before their fix: the six `settings_unreadable` file cases (I watched the first five fail together, then the link case alone), the future-time stamp test and the deleted-ledger test. Two more tests were added: one where the file becomes unreadable during the lock wait, and one where a missing file still merges.
- phase-c-smoke.sh on port 3189 at 609e67d5: PASS, with 102 ok lines and 0 FAIL.
- Review round 4 (4 of 8 rounds used). Code-review ran on Opus 5.5 xhigh, A on Opus 5.5 xhigh, B on GLM 5.3 Flash high (the GLM seat's fallback) and C on Haiku 5.5 xhigh. D ran on Sonnet 5.5 high, the Composer seat's fallback, because Cursor is unavailable until 2026-11-19. Code-review, A and B read 7a92b674. C and D read d01fd084. Act On items: code-review 0, A 0, B 0, C 2 (fixed), D 0. Seats proved every finding by running code.
- blast-radius: skipped (Risk: pre-release).
