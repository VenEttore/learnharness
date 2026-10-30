# 03: A bot creates a lesson, talks, and reads back over the API

Status: open
Blocked by: 02
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, src/server/index.ts, app/api/external/** (new), scripts/lh.mjs (new), new test files

Phase A.

**What to build:** A Bot Teacher creates a bot-run lesson with `lh lesson new`, posts text with `lh say`, reads typed learner input with `lh answer`, and reads the lesson back with `lh show`. Running any command twice is safe.

- [ ] Create takes `{ title, key, prompt? }`; `key` is required. A second create with the same key returns the same id with `existing: true` and saves nothing. Lookup and create run in one synchronous block. The title is shortened the way the normal create route shortens it. `prompt` becomes the first user message.
- [ ] The bot-run module holds one kinds table (tool, phases, schema, refinement, needs-plan-node, build). This ticket adds only the `say` row.
- [ ] The turn route runs checks 1–4 from the spec for `say`: bot-run lesson, `after`, repeat, unread input.
  - A rerun of the same `say` with the same `after` returns `repeat: true` and saves nothing, even if learner input arrived after it.
  - A `say` whose `after` is older than learner input is refused with those items.
- [ ] Bot assistant messages come from one constructor: block-array content, record id, normal stop reason, placeholder provider/model/usage stamps.
- [ ] Answer returns the learner's typed messages after the bot's last message, in order. Reading twice returns the same items.
- [ ] Show returns phase, `plan: null` (filled in by ticket 11), the open question, compact messages with question call ids, and the cursor.
- [ ] Every reply carries the cursor: the id of the newest message.
- [ ] `lh` is one Node 22 script with no dependencies.
  - `LH_URL` defaults to `http://127.0.0.1:3000`. Output is one JSON line. Exit codes are 0, 1 and 3.
  - Text comes from `--file` or stdin. Turn commands require `--after`.
  - Exit 3 names `LH_URL` and prints the guide path `docs/external-teacher.md`.
- [ ] Tests drive the route handlers directly. A test covers `lh`'s mapping from arguments to requests.

| Failure | Caller | Returns |
|---|---|---|
| Lesson not found | show, turn, answer | 404 `{ ok: false, code: "not_found" }` |
| Lesson is not bot-run | show, turn, answer | 409 `{ ok: false, code: "not_bot_run" }` |
| `key` missing on create | create | 400 `{ ok: false, code: "key_required" }` |
| `after` missing or not in the lesson | turn | 400 `{ ok: false, code: "bad_after", cursor }` |
| Learner input after `after` | turn | 409 `{ ok: false, code: "unread_input", items, cursor }` |
| LearnHarness unreachable | `lh` | exit 3, message names `LH_URL` and the guide path |
| Any refusal above | `lh` | exit 1, the route's JSON on one line |
