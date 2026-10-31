# 06: Probe questions

Status: resolved
Blocked by: 05
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, scripts/lh.mjs, new test files

Phase B.

**What to build:** A Bot Teacher posts `ask`, `probe` and `recall` questions, optionally with lead-in text, and gets a clear refusal for anything the page couldn't show or grade.

- [x] Kinds-table rows: `ask` (any phase), `probe` and `recall` (probe phase only).
- [x] Validation is the tool boundary:
  - check the payload against the tool's TypeBox schema, as pi checks it;
  - then run the tool's refinement;
  - return the problem text.

  A payload with no `options` returns problem text, not a crash.
- [x] The open-question and phase checks run in the spec's order (after repeat and unread input).
- [x] Lead-in text goes in the same assistant message as the question call.
- [x] The page's folds read each record: the open question is the new call, and the phase stays probe.
- [x] A rerun of the same question with the same `after` returns `repeat: true`, even after the learner has answered it. The same question asked again after a skip, with the newer `after`, is saved.
- [x] `lh ask|probe|recall` read JSON from `--file` or stdin.

| Failure | Caller | Returns |
|---|---|---|
| A question is still open | turn | 409 `{ ok: false, code: "open_question", cursor }` |
| Kind not allowed in this phase | turn | 409 `{ ok: false, code: "wrong_phase", phase, allowed }` |
| Payload fails the schema or refinement | turn | 422 `{ ok: false, code: "invalid", problems }` |

## Comments

### Shipped 2026-10-31
Completed:
- Kinds-table rows `ask` (any phase), `probe` and `recall` (probe only), reusing the tools' schemas and refinements from core/question-core.ts.
- Optional lead-in `text` goes in the same assistant message, ahead of the call. Trailing line breaks are trimmed, and a whitespace-only lead-in is dropped.
- Turn checks 5 (409 open_question) and 6 (409 wrong_phase, with phase and allowed) run in the spec's order.
- Validation order: unknown fields are refused on the raw payload, naming the field. Then pi's validateToolArguments runs, then any value whose JSON type pi would convert is refused, then the tool's refinement runs. This covers every kind, `say` included. A `type` field on probe or recall is refused, so the page can always read the saved call.
- The repeat check ignores JSON key order, and for question turns it ignores the lead-in.
- `lh ask|probe|recall <lesson> --after <cursor> [--file]` reads one JSON object. The command refuses input that is not JSON, not an object, or sets `kind` or `after`.
- Fixed a load-dependent race in tests/lh-cli.test.ts: the `lh` helper now ignores EPIPE on child stdin and rethrows anything else. A repro with an 8 MB stdin crashed without the handler and exited cleanly with it.
Deferred:
- Ticket 07, which owns answer items and the unread check, gets two gaps that came from ticket 03's design and surfaced in review round 3. First, a turn sent with `show`'s cursor is accepted past learner input that came after the bot's last message, and `answer` then no longer lists that input. This breaks the spec's "answer is complete" invariant. Second, a stale-`after` 409 unread_input lists input the bot already replied to, which `answer` does not list.
- Dropped: the GLM wobble guard (string-encoded `options`) is not applied, so a bot gets a 422. A `null` lead-in is refused (422), not dropped.
Verified:
- `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx` at 8e743ae, with feat/external-teacher a5ef41c (ticket 08 included) merged: 3029 tests, 3028 pass, 1 fail. The failure is the baseline Pi main-loader test.
- The new tests in tests/bot-run-questions.test.ts went red against the pre-change bot-run.ts (10 of 11 failed), and each review fix had a test that failed first.
- `next build` was not run, because it is not in docs/agents/check.md.
- Review used 3 rounds. Code-review passed every round. Interrogate found five bugs in rounds 1 and 2, all fixed: key order, lead-in rewording, a non-string `type`, stored unknown fields, and a stack overflow from deep unknown values. Round 3 had no Act On items.
- Blast-radius skipped: Risk pre-release.
