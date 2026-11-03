# 28: Graph reads for `lh`

Status: claimed
Blocked by: 27
Risk: pre-release
Gate: none
Host: linuxdev
Touches: new external routes under app/api/external/**, scripts/lh.mjs, new tests

Option A of .scratch/external-teacher/graph-feasibility.md, part 1. Reads only, no model call, reusing existing code.

- [ ] `lh extract-view <lesson>`: the lesson's unread teacher text, labelled by message id, plus what this lesson already added to the graph: the same view the extractor model gets (src/agent/subagents/extraction.ts).
- [ ] `lh graph find <query>`, `lh graph sessions`, `lh graph propositions`: the same results as the auditor's and prober's read-only graph tools.
- [ ] Tests: each read matches what the in-process tool returns for the same graph; a bot-run lesson's teacher text appears in extract-view; no model is called.
