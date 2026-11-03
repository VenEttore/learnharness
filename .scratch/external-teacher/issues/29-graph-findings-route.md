# 29: Bot findings into the graph

Status: open
Blocked by: 28
Risk: pre-release
Gate: none
Host: linuxdev
Touches: new external route, src/core/graph.ts only if a small hook is needed, ADR 0001, docs/architecture.md wording, new tests

Option A, part 2. The bot does the extractor and auditor work; LearnHarness validates and writes through mergeFindings, as the normal path does.

- [ ] `POST /api/external/chats/:id/findings` and `lh findings <lesson>`: takes `{findings, verdicts}` in the shapes the extractor and auditor return; validates with the existing validators; calls mergeFindings and the layout under the same lock; marks the messages read in the coverage file.
- [ ] Every fact and chain from this route carries a source tag (e.g. external) that a later cleanup can find. Say where it is stored.
- [ ] One run at a time per lesson; a rerun over already-read messages adds nothing.
- [ ] ADR 0001 and docs/architecture.md: "the merger is the only writer; what it merges comes from LearnHarness's model or a bot". LearnHarness still calls no model in a bot-run lesson.
- [ ] Tests: the same findings through this route and through the normal merge give the same files apart from the tag; bad shapes are refused; rerun is a no-op.
