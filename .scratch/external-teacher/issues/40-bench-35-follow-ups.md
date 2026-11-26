# 40: Follow-ups from ticket 35's bench

Status: open
Blocked by: 36
Risk: pre-release
Gate: none
Host: linuxdev
Touches: the page's answer display (answer-presentation.ts or its caller), docs/external-teacher.md sections 5 and 7, phase-c-smoke.sh if it covers the close, tests

From Ven's bench of ticket 35 (2026-11-26, via the Watcher). Blocked by 36 so the guide and page edits land on the 0.6.1 code.

- [ ] Two old lessons (chat_mvzen211_0a859d0f, chat_mvzenc8e_74316c4b, Bench 2 tests) return 500: `TypeError: saved.map is not a function` at answer-presentation.ts:38, because a stored probe answer has `options` as the string "oops". Find how that record was written and whether any current path (`lh submit`, the page, the bot routes) can still write it; if one can, refuse it at that boundary. Then make the page show a lesson with one bad answer record instead of failing the whole page (a narrow guard where the stored answer is read). Test with a fixture like those records.
- [ ] Guide section 7: the bot's learner line, sent after `remaining` reaches 0, is new teacher text, so `remaining` becomes 1 again. Fix the order or the instruction so a close ends with nothing unread and no fake facts (for example: send the line, then mark that last batch read with empty findings, if that is what the route expects). Check against the route's real behaviour and the smoke.
- [ ] Guide wording: `lh graph find` matches carry `propositionId`, not `id`; `probe-done` returns a cursor of the form `steer_probe_<id>`, not a message id. Fix every place the guide says otherwise.

## Check

Repo check (typecheck, lint, full tests; baseline one failure, the Pi loader test) and the smoke PASS.

## Comments
