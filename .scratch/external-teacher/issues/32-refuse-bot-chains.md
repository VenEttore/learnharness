# 32: Refuse bot chains; a ready count line for the learner

Status: claimed
Blocked by: 30
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/graph-findings.ts (POST /api/external/chats/:id/findings), src/server/graph-reads.ts (EXTRACTION_METHOD in the extract-view reply), scripts/lh.mjs if needed, docs/external-teacher.md section 7, GLOSSARY.md if it names chains from bots, .scratch/external-teacher/phase-c-smoke.sh section 9c, tests

From ticket 30's benches (Ven via the Watcher, 2026-11-16 and 2026-11-24). Ven chose (2026-11-24, Ven-approved): refuse the bot's chains in the server.

## Diagnosis

Symptom: bots write chains whose premises do not give the conclusion. All 5 seen have one shape: the general fact "same kanji, different readings, use the furigana" as the only premise of one word's reading (来ない as こ, 日 as ひ, 出 as で, 前 as まえ, 中 as なか). 1 of the bots' 6 chains was a real derivation.

Premise tested and false: "a bot follows a written rule about chains." Two fixes with that mechanism failed:
1. `method.extractor.instructions` (upstream's extractor prompt, sent in every `lh extract-view` reply) already says premises must jointly entail the conclusion. Lessons 1, 9 and 10 broke it.
2. fd0e330 added a chain check to guide section 7. The bot runs each close in a helper agent told only "run lh extract-view and merge the findings", which never reads the guide; lessons 9 and 10 broke the rule after it landed.

No code check is possible without a model call: entailment is a judgement. So the fix is structural. The external findings route does not accept chains.

## Code

- [x] `POST /api/external/chats/:id/findings` refuses a request whose `findings.chains` is non-empty, before any write, with one error code and a message that says to resend with `"chains": []`. `"chains": []` (and a missing `chains`, if the route accepts that today; say which) still works. LearnHarness's own extraction path is unchanged and still writes chains.
- [x] The `lh extract-view` reply tells the extractor step that chains are not accepted, so the bot's first send succeeds. It must reach a reader that follows only `method`. Pick the smallest way that keeps upstream's constants untouched (for example a fork-side note in `method.extractor`, or the chain fields removed from the `parameters` schema the bot sees), and say why.
- [x] The `lh findings` success reply carries a ready one-line count for the learner, built from the same numbers the reply already reports (new facts, linked facts), e.g. "This lesson added 4 new facts to your graph and linked 1 to facts it already had." Wording is yours; it must match `lh graph sessions` and the `links` sent.
- [x] Tests: a findings request with one chain is refused with that code and writes nothing (ledgers, coverage, `graphDataRevision` unchanged); `"chains": []` merges; the count line matches the merge for a case with new and linked facts; the extract-view reply carries the no-chains instruction.

## Guide and smoke

- [x] docs/external-teacher.md section 7: the bot sends `"chains": []` and drafts no chains. Replace fd0e330's chain-check sentence. After `lh findings`, the bot sends the learner the reply's count line as written. Search docs, GLOSSARY.md, the guide's other sections and the smoke for old wording about bot chains, and fix or list each hit.
- [x] Known limit in the guide: chains already written by bots stay in the graph; remove one by deleting its facts in the graph view (or leave it).
- [x] Smoke 9c: the findings step sends `"chains": []`, a request with a chain is refused with the code, and the count line is present.

## Check

Repo check (typecheck, lint, full tests: baseline is one failure, the Pi loader test) and `bash .scratch/external-teacher/phase-c-smoke.sh <port>` PASS. Optional bench: on Ven's next real lesson close, 0 new chains and the count line reaches the learner.

## Comments

### Implementation 2026-11-24 (sub-orchestrator, branch external-teacher-32-refuse-bot-chains)
- Refusal: `submitFindings` checks the raw body after the lesson and graph-switch checks and before the schema check. Any non-empty `findings.chains` array gets 400 `chains_not_accepted` with `message` ("... Resend the same findings with "chains": [].") and the cursor. A malformed body that also carries a chain gets this refusal first. `"chains": []` merges. A missing `chains` was refused as `bad_findings` before this ticket and still is; I kept that so the schema the bot sees matches the one the route checks. The chain rules in `strictProblems` and the `validateFindingsChains` call became unreachable, so I removed them. The pipeline's own extraction is unchanged and a test shows it still writes chains.
- extract-view: `method.extractor.instructions` is `BOT_CHAINS_NOTE`, a blank line, then upstream's `EXTRACTOR_INSTRUCTIONS`. `method.extractor.parameters` is upstream's schema with `chains` limited to `maxItems: 0`, and the same note as its description. Why both: the guide's own jq prints the instructions and the parameters in separate commands, and a helper that reads either one meets the rule. A separate `note` key would not reach a reader that follows only those two fields. Upstream's constants are untouched; the change sits in graph-reads.ts (fork file).
- Count line: every merge reply and every `alreadyRead` reply carries `newFacts`, `linkedFacts` and `learnerLine`, totalled over the whole lesson, not one batch. `newFacts` is the lesson's `propositions` from `graphSessionIndex`, the number `lh graph sessions` shows. `linkedFacts` counts node lines that name the lesson on a node an earlier line created, one per link written, so it equals the `links` entries the lesson's merges wrote, a `save_failed` send's included. A node's birth line (its first line with provenance, the rule `lh graph sessions` reads) is never counted as a link. The line reads "This lesson added N new facts to your graph and matched M of its statements to facts already there." (worded after the Spec recheck; first draft: "linked M to facts it already had"). It drops the second clause when M is 0 and says "no new facts" when N is 0. A lesson-wide count stays right after a lost reply or a close run in more than one go, which is why the guide's old hand count is gone.
- Guide (section 7, section 5 table, extract-view row), GLOSSARY.md (Extractor, Findings, Source tag) and ADR 0001 (a dated update line under Consequences) updated. The old wording search over docs/, GLOSSARY.md, scripts/lh.mjs and the smoke found these hits, all fixed: fd0e330's chain-check sentence (guide step 2); the hand count (guide, "When remaining is 0"); the JSON example's chain; the `findings`/`verdicts`/reply/`save_failed` bullets that described chains; "graph/chains.jsonl" in the tag bullet; smoke 9c's chain send, `.chains==1`, digest `⇒` check and tagged-chain expectation. Left as is: guide line 152 and line 283 ("chain-rule" slug, "a long chain of nodes"), which are not about graph chains, and the "Chain rule" example name. lh.mjs's help text does not mention chains.
- Smoke 9c: extract-view shows the note and `maxItems: 0`; a send with a chain exits 1 with `chains_not_accepted` and graphDataRevision does not move; the findings send `"chains": []` and the replies carry the count line, the rerun included; no tagged chain lines.

### Review round 1 (code-review) 2026-11-24
Standards and Spec on claudeAgent claude-opus-5-5 effort=xhigh, reviewing 94cc9f6a. Findings and dispositions: `.scratch/external-teacher/32/code-review-r1.md`. Fixes:
- docs/architecture.md still described bot chain lines; now says the route refuses chains. (mechanism: stale-doc-wording)
- graph-findings.ts header misstated the refusal order, and described chain tagging on a dead path. (mechanism: stale-doc-wording)
- The chains guard now also runs inside the lock on the filled, lifted findings the merge writes. (mechanism: guard-on-raw-body)
- linkedFacts counted a node's birth line as a link after the creating session was deleted, so one fact counted as both new and linked. It now skips the birth line. (mechanism: count-birth-line)
- Small cleanups: un-exported lessonTotals, one `lesson` object in submitFindings, one graph-reads import and the banner back in place in the test.
- Tests added: a read batch resent with a chain, two links to one node, and a chain while the graph is off.

### Review round 1 recheck (code-review Standards) 2026-11-24
Reviewing 1aa3f704. One hard finding and four judgement calls, all fixed (`.scratch/external-teacher/32/code-review-r1.md`):
- The chainsRefusal docstring named only the raw-body caller. (mechanism: stale-doc-wording)
- linkedFacts is now the lesson's node lines minus newFacts, so the birth rule is graphSessionIndex's alone and the two counts cannot drift. This removes a duplicated rule; the round-1 count fix itself held. (mechanism: duplicated-birth-rule)
- Comment and naming cleanups: the in-lock guard is marked defensive, submitFindings' object is `about`, and the taggedStore docstring is fixed.

### Diagnosis 2026-11-24
Covers (mechanism: stale-doc-wording).
Symptom: three review findings, each a comment or doc line that no longer matched the code: docs/architecture.md (round 1), the graph-findings.ts header (round 1), and the chainsRefusal docstring (recheck). The recheck finding was a new instance: round 1's fix 5 added a second caller and left the docstring describing one.
Shared premise: "after a code change I update the comments that describe what I changed." That premise was false twice. The docs search covered docs/external-teacher.md and GLOSSARY.md but not docs/architecture.md. Fix 5 changed who calls chainsRefusal without rereading that function's own docstring.
Loop: `.scratch/external-teacher/32/wording-check.sh` lists every line in the ticket's reach (both route files, all four docs, the ADR, lh.mjs and the smoke) that names chains, the chains refusal, the count fields or the source tag. I ran it at e40b0e94 and read each hit against the code: every hit matches, and docs/tool-content-recovery.md has no hit. From here on, rerun it after each fix and before each commit.

### Review round 1 recheck (code-review Spec) 2026-11-24
Reviewing 1aa3f704. Three findings:
1. The guard inside the lock has no test and cannot be reached. Already handled in e40b0e94: its comment calls it defensive and explains why.
2. Batch 2's link to a fact batch 1 added counted as linking to a fact the graph "already had", so the learner heard 4 facts where 3 exist. The numbers stay as the ticket defines them, matching `lh graph sessions` and the links. The line now says "matched M of its statements to facts already there", so a link reads as a restatement, not a fourth fact. (mechanism: learner-line-wording)
3. No test covered a `save_failed` send's links. Added "counts the links a save_failed send wrote before it failed": the second append throws, the landed link counts, and a resend without it brings linkedFacts to 2.

### Interrogate round 1, seat C (claude-haiku-5-5 xhigh, 5afc629a) 2026-11-24
Smoke PASS (117 ok, 0 FAIL); 41/41 in the two graph test files; the known-limit claim held (deleting a fact removed the chain that named it). Finding: after the learner deletes a lesson or a fact, a resend's `learnerLine` follows the graph, not the line the merge returned. Verified by rerunning the seat's repro. The ticket names `lh graph sessions` as the source of the count, so the live count stays. The guide now says the counts are read from the graph when each reply is built, and that `linkedFacts` drops links the learner has since deleted. (mechanism: count-contract-wording)

