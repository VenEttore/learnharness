# 10: Probe-done

Status: claimed
Blocked by: 09
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, scripts/lh.mjs, new test files

Phase C. Uses ticket 01's shared `probe_done` result.

**What to build:** A Bot Teacher finishes the probe with an assessment. The lesson moves to the plan phase the same way it does for LearnHarness's own model, and nothing wakes.

- [ ] Kinds-table row: `probe-done`, probe phase only, using the `probe_done` input schema.
- [ ] One commit writes three records in order: the `probe_done` call; the shared `probe_done` result as a real tool result joined to the call by id; then the handoff marker. It never runs the tool's own code and queues nothing.
- [ ] The phase fold moves from probe to plan, and `lh show` says `plan`.
- [ ] Rerunning `probe-done` after a following `say`, with the same `after`, returns `repeat: true` and appends nothing.
- [ ] After probe-done, `probe` and `recall` are refused as wrong phase.
- [ ] `lh answer` does not return the `probe_done` result or the handoff marker.
- [ ] `lh probe-done` reads JSON from `--file` or stdin.
