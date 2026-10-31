# 03: A bot creates a lesson, talks, and reads back over the API

Status: resolved
Blocked by: 02
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, src/server/index.ts, app/api/external/** (new), scripts/lh.mjs (new), new test files

Phase A.

**What to build:** A Bot Teacher creates a bot-run lesson with `lh lesson new`, posts text with `lh say`, reads typed learner input with `lh answer`, and reads the lesson back with `lh show`. Running any command twice is safe.

- [x] Create takes `{ title, key, prompt? }`; `key` is required. A second create with the same key returns the same id with `existing: true` and saves nothing. Lookup and create run in one synchronous block. The title is shortened the way the normal create route shortens it. `prompt` becomes the first user message.
- [x] The bot-run module holds one kinds table (tool, phases, schema, refinement, needs-plan-node, build). This ticket adds only the `say` row.
- [x] The turn route runs checks 1–4 from the spec for `say`: bot-run lesson, `after`, repeat, unread input.
  - A rerun of the same `say` with the same `after` returns `repeat: true` and saves nothing, even if learner input arrived after it.
  - A `say` whose `after` is older than learner input is refused with those items.
- [x] Bot assistant messages come from one constructor: block-array content, record id, normal stop reason, placeholder provider/model/usage stamps.
- [x] Answer returns the learner's typed messages after the bot's last message, in order. Reading twice returns the same items.
- [x] Show returns phase, `plan: null` (filled in by ticket 11), the open question, compact messages with question call ids, and the cursor.
- [x] Every reply carries the cursor: the id of the newest message.
- [x] `lh` is one Node 22 script with no dependencies.
  - `LH_URL` defaults to `http://127.0.0.1:3000`. Output is one JSON line. Exit codes are 0, 1 and 3.
  - Text comes from `--file` or stdin. Turn commands require `--after`.
  - Exit 3 names `LH_URL` and prints the guide path `docs/external-teacher.md`.
- [x] Tests drive the route handlers directly. A test covers `lh`'s mapping from arguments to requests.

| Failure | Caller | Returns |
|---|---|---|
| Lesson not found | show, turn, answer | 404 `{ ok: false, code: "not_found" }` |
| Lesson is not bot-run | show, turn, answer | 409 `{ ok: false, code: "not_bot_run" }` |
| `key` missing on create | create | 400 `{ ok: false, code: "key_required" }` |
| `after` missing or not in the lesson | turn | 400 `{ ok: false, code: "bad_after", cursor }` |
| Learner input after `after` | turn | 409 `{ ok: false, code: "unread_input", items, cursor }` |
| Browser `Origin`, or a non-loopback `Host` | all four routes | 403 `{ ok: false, code: "forbidden_origin" \| "forbidden_host" }` |
| `title`, `prompt` or `text` not a string (`null` included), or empty `text` | create, turn | 422 `{ ok: false, code: "invalid", problems }` |
| The turn's save fails | turn | 500 `{ ok: false, code: "save_failed", cursor }` |
| LearnHarness unreachable | `lh` | exit 3, message names `LH_URL` and the guide path |
| Any refusal above | `lh` | exit 1, the route's JSON on one line |

## Comments

### Shipped 2026-10-31
Completed:
- Create, show, answer and turn routes under `app/api/external/**`, thin wrappers over `src/server/bot-run.ts` through the server barrel.
- Create takes `{ title, key, prompt? }`. A second create with the same key returns the same lesson with `existing: true` and its unread items, and saves nothing. The prompt rides createChat's one save.
- One kinds table holding only the `say` row. Turn checks 1–4 run in spec order with no await between the read and the write. `say` trims trailing `\n`/`\r` in linear time, so the text `show` returns says back to itself.
- One constructor for bot assistant messages. Every reply carries the cursor, and a reply whose cursor passes unread input carries `items`.
- Origin and non-loopback Host guard on all four routes. `invalid` (422) covers a non-string title, prompt or text, `null` included. `save_failed` is a JSON 500.
- `scripts/lh.mjs`: one Node 22 script with no dependencies. `LH_URL` defaults to `http://127.0.0.1:3000`, output is one JSON line, exit codes are 0/1/3. Exit 3 names `LH_URL` and the guide path. It refuses extra positionals, an empty `--file`, and stdin that is never closed.
- Tests: `tests/bot-run-api.test.ts` (route handlers) and `tests/lh-cli.test.ts` (`lh` as a child process).
Deferred:
- Ticket 13 (guide): start LearnHarness bound to 127.0.0.1 (`-H 127.0.0.1`). `next dev` and `next start` bind every interface by default, and a LAN peer can forge `Host`, so the bind is the real fence. API auth stays out of scope.
- Ticket 13 (guide): after a lost `say` reply, check `show` for the text before resending. A resend with the newest cursor saves the turn again, as spec check 3 orders.
- Dropped: `lh say --file <fifo>` with no writer hangs (contrived on the bot computer). Cross-origin `text/plain` POSTs to the existing `/api/chat` and `/api/chats` were not changed (they predate this ticket, and auth is out of scope). Keys are matched exactly, with no trimming.
Verified: `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx` after merging feat/external-teacher at 1e956d8: 3006/3007 pass. The one failure is the baseline Pi main-loader test. Review: 5 rounds. Round 4: code-review passed on both axes, and interrogate (4 seats) found 3 Act On items, all fixed test-first. Round 5: interrogate (3 seats; the Grok 4.7 seat was unavailable) returned no Act On. Round 5 code-review did not run: its Grok 4.7 seat failed twice with a provider error. Blast-radius skipped: Risk pre-release.
