# 06: Probe questions

Status: open
Blocked by: 05
Risk: pre-release
Gate: none
Host: laptop
Touches: src/server/bot-run.ts, scripts/lh.mjs, new test files

Phase B.

**What to build:** A Bot Teacher posts `ask`, `probe` and `recall` questions, optionally with lead-in text, and gets a clear refusal for anything the page couldn't show or grade.

- [ ] Kinds-table rows: `ask` (any phase), `probe` and `recall` (probe phase only).
- [ ] Validation is the tool boundary:
  - check the payload against the tool's TypeBox schema, as pi checks it;
  - then run the tool's refinement;
  - return the problem text.

  A payload with no `options` returns problem text, not a crash.
- [ ] The open-question and phase checks run in the spec's order (after repeat and unread input).
- [ ] Lead-in text goes in the same assistant message as the question call.
- [ ] The page's folds read each record: the open question is the new call, and the phase stays probe.
- [ ] A rerun of the same question with the same `after` returns `repeat: true`, even after the learner has answered it. The same question asked again after a skip, with the newer `after`, is saved.
- [ ] `lh ask|probe|recall` read JSON from `--file` or stdin.

| Failure | Caller | Returns |
|---|---|---|
| A question is still open | turn | 409 `{ ok: false, code: "open_question", cursor }` |
| Kind not allowed in this phase | turn | 409 `{ ok: false, code: "wrong_phase", phase, allowed }` |
| Payload fails the schema or refinement | turn | 422 `{ ok: false, code: "invalid", problems }` |
