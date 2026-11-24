# 32: Refuse bot chains; a ready count line for the learner

Status: open
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

- [ ] `POST /api/external/chats/:id/findings` refuses a request whose `findings.chains` is non-empty, before any write, with one error code and a message that says to resend with `"chains": []`. `"chains": []` (and a missing `chains`, if the route accepts that today; say which) still works. LearnHarness's own extraction path is unchanged and still writes chains.
- [ ] The `lh extract-view` reply tells the extractor step that chains are not accepted, so the bot's first send succeeds. It must reach a reader that follows only `method`. Pick the smallest way that keeps upstream's constants untouched (for example a fork-side note in `method.extractor`, or the chain fields removed from the `parameters` schema the bot sees), and say why.
- [ ] The `lh findings` success reply carries a ready one-line count for the learner, built from the same numbers the reply already reports (new facts, linked facts), e.g. "This lesson added 4 new facts to your graph and linked 1 to facts it already had." Wording is yours; it must match `lh graph sessions` and the `links` sent.
- [ ] Tests: a findings request with one chain is refused with that code and writes nothing (ledgers, coverage, `graphDataRevision` unchanged); `"chains": []` merges; the count line matches the merge for a case with new and linked facts; the extract-view reply carries the no-chains instruction.

## Guide and smoke

- [ ] docs/external-teacher.md section 7: the bot sends `"chains": []` and drafts no chains. Replace fd0e330's chain-check sentence. After `lh findings`, the bot sends the learner the reply's count line as written. Search docs, GLOSSARY.md, the guide's other sections and the smoke for old wording about bot chains, and fix or list each hit.
- [ ] Known limit in the guide: chains already written by bots stay in the graph; remove one by deleting its facts in the graph view (or leave it).
- [ ] Smoke 9c: the findings step sends `"chains": []`, a request with a chain is refused with the code, and the count line is present.

## Check

Repo check (typecheck, lint, full tests: baseline is one failure, the Pi loader test) and `bash .scratch/external-teacher/phase-c-smoke.sh <port>` PASS. Optional bench: on Ven's next real lesson close, 0 new chains and the count line reaches the learner.

## Comments
