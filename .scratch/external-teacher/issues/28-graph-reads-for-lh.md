# 28: Graph reads for `lh`

Status: resolved
Blocked by: 27
Risk: pre-release
Gate: none
Host: linuxdev
Touches: new external routes under app/api/external/**, scripts/lh.mjs, new tests

Option A of .scratch/external-teacher/graph-feasibility.md, part 1. Reads only, no model call, reusing existing code.

- [x] `lh extract-view <lesson>`: the lesson's unread teacher text, labelled by message id, plus what this lesson already added to the graph: the same view the extractor model gets (src/agent/subagents/extraction.ts).
- [x] `lh graph find <query>`, `lh graph sessions`, `lh graph propositions`: the same results as the auditor's and prober's read-only graph tools.
- [x] Tests: each read matches what the in-process tool returns for the same graph; a bot-run lesson's teacher text appears in extract-view; no model is called.

## Comments

### Shipped 2026-11-09 (stopped at review cap 2026-11-03; Matt accepted)
Three review rounds ran, the most that launch allowed. Round 3 had one finding. Commit bd23619b fixes it (2 lines in scripts/lh.mjs plus 2 tests, within the small-diff rule) and shipped unreviewed: Matt accepted the ticket as it stood on 2026-11-09.

Completed:
- `lh extract-view <lesson>` calls GET /api/external/chats/:id/extract-view. It returns the lesson's teacher text that the extractor has not read yet, in the extractor's own batches. Each batch has its `view` ("TEACHER [id] text" passages) and its `messageIds` (the ids a finding from that batch may name). The reply also has the lesson's `digest` (what it already added to the graph), `prompt` (the extractor's input for the first batch), and `cursor` and `items` the way `lh show` returns them. It works on bot-run lessons only: an ordinary lesson gets 409 `not_bot_run`, and an unknown id gets 404 `not_found`.
- `lh graph sessions` and `lh graph propositions <session>` call GET /api/external/graph/sessions and GET /api/external/graph/sessions/:id/propositions. Each reply has the data plus `auditorText` and `proberText`, the exact text the auditor's and the prober's in-process tools return.
- `lh graph find "<query>" [--offset n]` and `lh graph find --file <json>` call POST /api/external/graph/find. The search is the auditor's `find_candidates`, with the same ranking and five-per-page paging. Where the tool hands out an in-memory cursor, the route returns `nextOffset`. A bad body gets 400 `bad_find` with a `problems` list.
- Code: src/server/graph-reads.ts (new). Four routes under app/api/external/. scripts/lh.mjs now has one shared JSON reader and a flag list per graph subcommand. src/server/bot-run.ts (a fork file) exports `botLesson`, `externalFailure` (renamed from `fail`) and `cursorAndItems`. The one upstream edit is `export` on `proseView` in extraction.ts, plus one barrel line in src/server/index.ts.
- Docs: guide section 7 covers the new commands, `bad_find` is in section 5, and section 2's items list names extract-view. GLOSSARY.md has a new knowledge graph section: knowledge graph, extractor, auditor, chain, proposition, session, extraction view, digest, candidate.

Deferred:
- Review of bd23619b: lh now refuses "." and ".." as a session id, because the URL parser turns them into other paths. The change is 2 lines in scripts/lh.mjs plus 2 test cases. It is within the small-diff rule (pre-release, at most 20 lines outside tests, no new interface), so the parent can ship without another round.
- Existing commands with a lesson id of "." or "..", such as `lh show .`, have the same URL quirk. That code predates this ticket and was not changed.
- Round 3 Standards judgement calls, left as they are: `extractViewOf` repeats `runExtraction`'s batching (the parity test catches drift); create and `showBotLesson` still build cursor and items by hand instead of calling `cursorAndItems`; extract-view's reply names the lesson `lesson` where `lh show` says `id`; graph-reads.ts's header cites the scratch feasibility note.
- Ticket 29 must rebuild the batch on the server when findings arrive and check the bot's `messageIds` against it, because new messages can change the last batch.

Verified:
- Full repo check at 13fb4b28: typecheck and lint pass (0 errors, the existing `<head>` warning). 3447 of 3448 tests pass. The one failure is the baseline Pi loader test.
- At bd23619b (13fb4b28 plus the 2-line lh fix): `NODE_ENV=test npx tsx --test --test-concurrency=2 tests/lh-*.test.ts tests/graph-reads.test.ts tests/bot-run-*.test.ts` passes 165 of 165. Typecheck passes. Lint has 0 errors.
- tests/graph-reads.test.ts runs the real extraction pipeline with scripted models on an ordinary lesson. At each extractor call it checks that extract-view's prompt, view and message ids equal what the model received, batch by batch. Changing the digest join from two newlines to one made this test fail. The test also compares each graph route with the in-process tools, including find's page 2 and hints. It checks that no read calls fetch, and that all four routes refuse a browser Origin with 403.
- phase-c-smoke.sh on port 3188 at bd23619b: PASS, with 102 ok lines and 0 FAIL. An earlier run on the same commit had 2 FAIL lines. Both were lh's 30-second timeout while Next compiled routes for the first time; host swap was full and the load was over 15. The rerun used a warm compile cache at load 6.
- Review: rounds 1 to 3 each ran code-review (Standards and Spec, Opus 5.5 xhigh), interrogate A (Opus 5.5 xhigh) and interrogate C (Haiku 5.5 xhigh). Round 1 found 15 items, all fixed. Round 2 found the extract-view cursor skipping unread learner input, the coverage wording, and glossary gaps, all fixed. Round 3: Spec 0, Standards 0 hard violations, interrogate A 0, interrogate C 1 (the "." session id, fixed in bd23619b).
- Seats skipped: GLM 5.3 Flash and Composer 2.5, because Cursor usage is limited until 2026-11-19.
- blast-radius: skipped (Risk: pre-release).

