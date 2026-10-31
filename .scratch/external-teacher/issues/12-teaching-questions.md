# 12: Teaching questions

Status: claimed
Blocked by: 11
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, scripts/lh.mjs, new test files

Phase C. Uses ticket 01's shared plan-node check.

**What to build:** A Bot Teacher teaches with predict and check questions, and free-recall questions, each tagged with a plan node. The page shows teaching progress on the map.

- [ ] Kinds-table rows: `quiz` and `explain`, allowed in the plan and teach phases. Each uses the teaching schema (`type` and `nodeId` required), then the refinement, then the shared plan-node check.
- [ ] An unknown `nodeId` is refused with the check's text.
- [ ] The first tagged question moves the phase fold to teach.
- [ ] A plan rewrite during the teach phase is still accepted (ticket 11's row).
- [ ] `lh quiz|explain` read JSON from `--file` or stdin.

| Failure | Caller | Returns |
|---|---|---|
| Unknown plan node, or the payload fails the schema or refinement | turn | 422 `{ ok: false, code: "invalid", problems }` |
| `quiz` or `explain` before probe-done | turn | 409 `{ ok: false, code: "wrong_phase", phase, allowed }` |
