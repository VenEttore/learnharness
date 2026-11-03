# 30: Guide: add to the graph at lesson close

Status: open
Blocked by: 29
Risk: pre-release
Gate: human (Ven reviews the facts a bot adds from one real lesson before this is the default)
Host: linuxdev
Touches: docs/external-teacher.md, phase-c-smoke.sh

Option A, part 3.

- [ ] Guide: at lesson close, run `lh extract-view`, follow LearnHarness's extractor and auditor instructions (copied from upstream 0.4.1's prompts, pointed to by path), check candidates with `lh graph find`, then `lh findings`. A missed close can run later.
- [ ] Guide, probe: use `lh graph sessions` and `lh graph propositions` to see what earlier lessons covered.
- [ ] Smoke covers extract-view, findings and a rerun.
- [ ] Bench: Ven reviews the facts and chains a bot adds from one real lesson (e.g. the Japanese lessons) on the home graph.
