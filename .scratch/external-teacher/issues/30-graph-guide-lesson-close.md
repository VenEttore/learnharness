# 30: Guide: add to the graph at lesson close

Status: claimed
Blocked by: 29
Risk: pre-release
Gate: human (Ven reviews the facts a bot adds from one real lesson before this is the default)
Host: linuxdev
Touches: docs/external-teacher.md, phase-c-smoke.sh, the lesson page coverage ring (whatever refetch the graph view got in 29)

Option A, part 3.

- [x] Guide: at lesson close, run `lh extract-view`, follow LearnHarness's extractor and auditor instructions (copied from upstream 0.4.1's prompts, pointed to by path), check candidates with `lh graph find`, then `lh findings`. A missed close can run later.
- [x] Guide, probe: use `lh graph sessions` and `lh graph propositions` to see what earlier lessons covered.
- [x] The lesson page's coverage ring (how much of the lesson has been read for facts) redraws after `lh findings`, as the graph view does since 29. Deferred from 29; Matt put it here (2026-11-14).
- [x] Smoke covers extract-view, findings and a rerun.
- [ ] Bench: Ven reviews the facts and chains a bot adds from one real lesson (e.g. the Japanese lessons) on the home graph.

## Comments

### Matt 2026-11-15
Accepted 78692872 unreviewed under the small-diff rule (no "Continue 30"). Gate: human stays open: Ven's lesson of 2026-11-14 ran on a bench with 27 and 28 only, so the lesson-close steps below have not run on a real lesson yet. No follow-up ticket for a hung graph fetch.

### Bench 1, 2026-11-16 (Ven via Watcher; not yet "30 done")
Lesson chat_mwiox0ir_7dcab15d on bench-30 at c5eebf6, empty graph before. Close per section 7 wrote 8 facts and 3 chains, all `"source":"external"`; `lh extract-view` then returns `items: []`.
- Facts: all 8 true, standalone and taught. Pass.
- Chains: arg_e1c56a56315c is a real derivation. arg_82d21c1ac2f9 and arg_426e63dee3aa go from "same kanji, different readings, use the furigana" alone to a specific reading (来ない as こ, 日 as ひ). The premise does not give the reading, so they break the extractor prompt's own rule ("premises that JOINTLY entail a conclusion", extraction.ts:405). Nothing checks chains on either path; the auditor sees only propositions.
- Empty `messageId` on chains is by design (chains are chat-level, graph.ts:121, 251; same on the built-in path).
- Not tested: linking to an existing fact (graph was empty), the ring on the page.

### Stopped at review cap 2026-11-14 (status stays claimed; Gate: human still open)
Three review rounds ran, all this launch allowed. Round 3 found 4 Act On items, all in guide wording and one smoke message. Commit 78692872 fixes all 4. It changes 6 lines outside tests (4 in the guide, 1 in GLOSSARY.md, 1 in the smoke) and adds no interface, so it fits the small-diff rule, but no seat has read it. No Act On item is open. Checklist items 1 to 4 are done. Item 5 is Ven's bench, below.

Completed:
- Guide section 7 has a new subsection, "At lesson close". After the closing `say`, the bot runs `lh extract-view`, does the extractor's work over `prompt`, drafts facts for `lh graph find --file`, does the auditor's work, sends `lh findings`, and loops while `remaining` is above 0. The subsection gives four `jq` lines for reading the long reply. It says how to count new facts (from `lh graph sessions`) and linked facts (from the bot's `links`), and where the result shows (the ring empties, and the facts appear on the home page graph). It also covers a missed close run later and a graph that is turned off.
- Guide section 3, Probe: before the first question, run `lh graph sessions`, then `lh graph propositions` for related lessons. The graph records what was taught, not how the learner did, and a lesson whose facts were all linked is not listed. The Teach section's closing sentence points to section 7.
- Guide section 6 points to the extractor and auditor prompts by path: `EXTRACTOR_INSTRUCTIONS`, `AUDITOR_INSTRUCTIONS`, `sessionFindingsSchema` and `auditSchema` in src/agent/subagents/extraction.ts. They are not under src/agent/prompts/. The table now maps `find_candidates` to `lh graph find`: to page, resend the same entry with its `hints` and `offset` set to `nextOffset`.
- The bot reads the prompts over `lh`. The extractor prompt is a template string assembled from several constants, so a path alone would leave the bot to assemble it by hand. The smallest way was to return the assembled text: `lh extract-view` now carries `method.extractor` and `method.auditor`, each with `instructions` (the model's system prompt), `tool` and `parameters` (the submit tool's JSON schema, field descriptions included). They are the live constants, so upstream tuning reaches the bot with no guide change. Code: `EXTRACTION_METHOD` in src/server/graph-reads.ts, plus one `export` on `AUDITOR_INSTRUCTIONS` in extraction.ts.
- Coverage ring: the lesson page's ring now redraws after `lh findings`. components/graph-data-tick.ts is new. On each `activity-changed` event (debounced 250 ms) and on reconnect, it rereads /api/graph/status, and it moves a counter when `graphDataRevision` changes. That is the signal the graph view uses since ticket 29. The first read always counts as a change, and a reply older than the newest one applied is dropped. components/extraction-coverage.tsx gets 3 lines, adding the counter to the ring's coverage refetch. graph-view.tsx is untouched (ticket 31).
- Smoke section 9c checks lesson close on the smoke's lesson. It runs `lh graph sessions` on an empty graph, then `extract-view` with `method`, then `graph find`, then `findings` (2 facts, 1 chain), then a rerun (`alreadyRead`). It then checks that extract-view is empty, the tagged ledger lines, `lh graph sessions` and `propositions`, `graphDataRevision` moving, and the ring's numbers dropping to zero.
- GLOSSARY.md: the digest also lists existing facts the lesson linked to.

Deferred:
- Bench (Gate: human), checklist below.
- Notes left as they are:
  - The ring rereads the whole chat on every graph write anywhere, and a failed read hides the ring until the next one. The hiding predates this ticket.
  - A run of events under 250 ms apart postpones the status read, as in the graph view.
  - The smoke lesson has one batch, so the smoke's loop never runs. The cold-bot seat and interrogate C ran lessons of 3 to 6 batches by hand, and tests/graph-findings.test.ts covers two batches.
  - The smoke's extract-view check matches the upstream phrase "extraction stage", so an upstream rewording would fail it.
  - The ring tests wait on timers. They passed 24 runs under load, plus 8 runs with a blocked event loop.
  - `method` leaves out the auditor's lookup tools and the lead line of its first message. The guide maps the lookup tools to `lh graph` and says what the auditor's input is.
  - `extract-view` does not report whether the graph is on. The guide says the bot learns that only from `lh findings`.
  - Predates this ticket, not changed:
    - `lh graph`'s usage line omits `--file` and `--offset`.
    - The `proberText` for an unknown session tells the reader to call `list_sessions`.
    - Chain lines carry an empty `messageId` in their provenance. Nobody checked whether the pipeline's chains do the same.
- Ticket 31 (the graph view's first-load race) was not touched.

Verified:
- Full repo check at 78692872 (the tip, with feat/external-teacher 1d0e25f2 merged): typecheck passes, lint has 0 errors and 1 warning (the existing `<head>` one), and 3476 of 3477 tests pass. The one failure is the baseline Pi loader test. At a5449426 (round 3's commit): typecheck passes, lint has 0 errors and 1 warning (the existing `<head>` one), and 3476 of 3477 tests pass. The one failure is the baseline Pi loader test.
- phase-c-smoke.sh on port 3190 at 78692872: PASS, 114 ok lines, 0 FAIL, including all of section 9c.
- tests/graph-reads.test.ts has a new test. It runs the real pipeline with scripted models and checks that `method`'s instructions and schemas equal the system prompt and tool schema each model received. Swapping the auditor schema made it fail.
- tests/coverage-ring-refresh.test.tsx has 4 tests, each run under linkedom with a fake event source and fake server. Each fails when its rule breaks:
  - the ring test failed with the counter removed from the ring's refetch;
  - the first-read test failed when the first read only recorded the revision;
  - the late-reply test failed with no reply guard;
  - the failed-newer-read test failed when the guard compared against the newest read sent;
  - the unmount check failed with the timer cleanup removed.
- Review rounds (3 of 8 used):
  - Seats: code-review on Opus 5.5 xhigh, A on Opus 5.5 xhigh, B on GLM 5.3 Flash high (the GLM seat's fallback), C on Haiku 5.5 xhigh, and D on Sonnet 5.5 high (the Composer seat's fallback; Cursor is unavailable until 2026-11-19). D was the cold bot. Each round it followed the guide end to end on a temp graph, with 2 to 4 lessons, linking, paging, multi-batch closes, graph off and on, and the missed close. In round 1 it watched the ring redraw in a browser.
  - Round 1 at 6a927e44: code-review 1, A 1, B 0, D 0. C sent no report: it ended its turn to wait on a monitor, so it was relaunched once, in round 2. B ran in the implementer's checkout instead of its own worktree and changed nothing there.
  - Round 2 at 2fc20448: code-review 0, A 0, B 0, C 2, D 3 (one repeated a code-review note).
  - Round 3 at a5449426: code-review 0, A 1, B 0, C 3, D 0.
  - Every finding was proven by running code. Every Act On item is fixed.
- blast-radius: skipped (Risk: pre-release).

### Bench checklist (Gate: human, for Ven through the Watcher)
Ven checks the facts and chains a Bot Teacher adds from one real lesson before lesson-close findings become the default. A fact is one statement in LearnHarness's knowledge graph. A chain says some facts together imply another.

1. Update the bot's computer. The code is on the ticket branch, not on `main`. Stop the LearnHarness server the bot started, by its PID, then run:
   ```bash
   cd /workspace/learnharness
   git fetch origin external-teacher-30-graph-guide-lesson-close
   git checkout -B bench-30 FETCH_HEAD
   npm ci
   ```
   Start the server as guide section 1, step 4 says, and run step 5's check. Tell the bot to reread docs/external-teacher.md: section 3 ("Probe" and "Teach") and section 7 ("At lesson close").
2. Run one real lesson the usual way, for example the next Japanese lesson. In the probe, the bot runs `lh graph sessions` before its first question, and `lh graph propositions <id>` for any related earlier lesson. On a fresh graph `sessions` is `[]`.
3. After the closing `say`, the bot follows section 7 "At lesson close":
   - it runs `lh extract-view "$L" > view.json` and reads `method` with the guide's `jq` lines;
   - it does the extractor's work over `prompt`;
   - it runs `lh graph find --file drafts.json` and does the auditor's work;
   - it runs `lh findings "$L" --file findings.json`;
   - it repeats from `lh extract-view` while `remaining` is above 0.
   Ask the Watcher to relay each `lh findings` reply (`merged`, `nodes`, `chains`, `remaining`) and the one line the bot tells the learner.
4. Look at what was added:
   - On the bot's computer, run `grep '"source":"external"' /workspace/lh-data/graph/nodes.jsonl` and the same for `chains.jsonl`. Every line the bot added carries the tag. A node line that reuses an existing fact's id is a link: the graph keeps the old name and statement, and adds the bot's statement as an alias.
   - `lh graph propositions "$L"` lists the new facts with their statements.
   - Through Take over, open `http://127.0.0.1:3000/` and click each fact to read it and its chains. The lesson page's coverage ring, next to the phase chip, is empty.
5. Pass when all of these hold:
   - every fact is true, makes sense to someone who never saw the lesson, and was taught in the lesson;
   - no fact is about the learner or the lesson itself;
   - every chain is a real derivation, with premises that together imply the conclusion;
   - from the second bot lesson on, a fact the graph already held is linked to it, not added again;
   - the ring emptied without a reload;
   - a second run of the close steps adds nothing: `lh extract-view` shows `batches: []`, and resending the last findings file returns `"alreadyRead": true`;
   - the bot's line to the learner matches `lh graph sessions` (that lesson's `propositions`) and the bot's `links`.
6. If the facts are bad, remove them:
   - For a few bad facts, click each one on the home page graph and delete it.
   - For all of the lesson's facts, delete the lesson from the sidebar with "Also remove its graph traces" ticked. That deletes the lesson too, so save it first with `lh show "$L" > lesson.json`.
   - Removal is not a full undo. If the merge simplified chains, it may have dropped another lesson's chain, and deleting the bot's facts does not restore it (ADR 0001).
   - Report what was wrong so the guide can be fixed.
