# 11: Plan

Status: claimed
Blocked by: 10
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, app/api/external/** (show), scripts/lh.mjs, new test files

Phase C. Uses ticket 01's shared `plan_init` result and plan input schema.

**What to build:** A Bot Teacher posts the lesson plan as a Mermaid diagram. The owner sees the plan map and the in-lesson plan block. A broken plan is refused and saves nothing.

- [ ] Kinds-table row: `plan`, allowed in the plan and teach phases. It runs the plan input schema, then the Mermaid parser, then the tree builder.
- [ ] Parser problems and `PlanTreeError` (for example a cycle or a duplicate id) return the problem text. Neither the tree save nor the message save runs.
- [ ] On success, the tree is saved first with the store's tree save. Then one commit, through the commit helper, writes three things: the `plan_init` call, the shared result carrying the tree (joined by id), and the plan-block markers built the way the existing turn persist builds them.
- [ ] The page's plan map reads the tree from the result, and the plan-block markers are present. Tests go through the view projection.
- [ ] `lh show`'s `plan` is the latest successful plan in the transcript.
- [ ] A later `plan` (a rewrite) is accepted and replaces the tree.
- [ ] Crash repair: with the tree saved and the messages missing, a rerun saves the messages and is not treated as a repeat.
- [ ] `lh plan` reads Mermaid text from `--file` or stdin.

| Failure | Caller | Returns |
|---|---|---|
| Mermaid doesn't parse, or the tree is invalid | turn | 422 `{ ok: false, code: "invalid", problems }` |
| `plan` before probe-done | turn | 409 `{ ok: false, code: "wrong_phase", phase, allowed }` |
