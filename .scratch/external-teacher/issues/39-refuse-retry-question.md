# 39: Refuse retry-question in bot-run lessons

Status: open
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts (handleBotRunInput), tests/bot-run-page-input.test.ts, docs/external-teacher.md if it lists refused inputs

From ticket 35's handoff (and deferred since ticket 27). Matt chose (2026-11-26): refuse it.

`handleBotRunInput` refuses `continue` and `retry` for a bot-run lesson with 422 `bot_run_lesson`, before any model check. The page can still send `retry-question` (re-issue a malformed open question) for a bot-run lesson. No model runs today, and the bot route refuses malformed questions, so it is near-unreachable, but it is the one page input not refused the same way.

- [ ] `handleBotRunInput` refuses `retry-question` for a bot-run lesson with the same 422 `bot_run_lesson` shape, before anything is written. Find the check the code uses for `continue` and `retry` and extend it; do not add a second gate.
- [ ] Say what the page shows when this 422 comes back (the same as for `continue`?). If the page would show a broken state, note it; do not redesign the page.
- [ ] Tests: `retry-question` on a bot-run lesson gets 422 and writes nothing; on an ordinary lesson it behaves as before.
- [ ] Search the guide and ADR 0001 for the list of refused inputs and add it where they list them.

## Check

Repo check (typecheck, lint, full tests; baseline one failure, the Pi loader test) and `bash .scratch/external-teacher/phase-c-smoke.sh <port>` PASS.

## Comments
