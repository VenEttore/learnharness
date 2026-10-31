# 07: Reading answers and skips

Status: resolved
Blocked by: 06
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, app/api/external/chats/[id]/answer, scripts/lh.mjs, app/api/chats/[id]/dismiss/route.ts, new test files

Phase B.

**What to build:** `lh answer` returns everything the page recorded for each answer and skip, `--wait` waits for learner input, and a skip refreshes the sidebar.

Answer item fields. Sources are the tool-result message and the stored answer data on its details:

| Field | Source |
|---|---|
| `type` | `"answer"` |
| `id` | the tool-result message id |
| `toolCallId` | the tool result's call id |
| `kind` | the stored answer kind |
| `question` | stored `questionText` |
| `answers` | the picks, as `{ index, label }` |
| `dontKnow` | stored `dontKnow` |
| `text` | stored `text` |
| `other` | stored `other` |
| `thinking` | stored `thinking`, else stored `note` |
| `readingThinking` | stored `readingThinking` |
| `confidence` | stored `confidence` |
| `correct` | stored `correct` |

Check every source name against the stored answer type before using it.

- [x] Answer items follow the table. A dismissed result becomes `{ type: "skip", id, toolCallId, kind }`. The bot's own tool results and markers are excluded.
- [x] An answer saved through the page's send route (ticket 02) comes back as an item with every field it carried.
- [x] `lh answer --wait` checks every 2 s until there is at least one item, for 10 minutes by default (`--timeout` changes it). On timeout it prints `{ ok: false, error: "timeout" }` and exits 2.
- [x] The dismiss route emits `chats-changed` for every lesson. Tests cover an ordinary lesson and a bot-run lesson.

## Comments

### Shipped 2026-10-31
Completed:
- `answer` items cover typed messages and question results. An answer copies the ticket table's fields from the stored QuestionAnswerData: `question` comes from `questionText`, `thinking` from `thinking ?? note`, and picks come back as `{ index, label }`. Absent fields are left out. A dismissed result is `{ type: "skip", id, toolCallId, kind }`. Only results of question tools count, so `probe_done` and `plan_init` results and markers are left out.
- Turn check 4 counts answers and skips. It reads unread input past both `after` and the bot's last message, so a stale `after` no longer lists input the bot already replied to. That fixes deferred gap 2 from ticket 06.
- `show` and a new create now carry `items`, the unread input their cursor passes, as the repeat, same-key create and bad_after replies already did. That fixes deferred gap 1 from ticket 06: every reply whose cursor passes unread input hands that input to the bot.
- The dismiss route emits `chats-changed` for every lesson. It now reads the record after awaiting the body, so a skip that races an answer is refused with 400 and no longer overwrites the answer. The store's silence-law comment names the dismiss route as a fork exception.
- `lh answer [--wait] [--timeout <s>]` checks every 2 s until there is at least one item, for 600 s by default. On timeout it prints `{ ok: false, error: "timeout" }` and exits 2. A refusal exits 1 and an unreachable server exits 3, both at once. `--wait` takes no value, and `--timeout` needs `--wait` and a number above 0. `LH_WAIT_POLL_MS` is a test-only override of the interval, like `LH_STDIN_TIMEOUT_MS`.
- The fake server in tests/lh-cli.test.ts ignores requests outside `/api/`. Something on the shared host probes local ports with `GET /`, and that stray request made the request-count assertions flaky.
Deferred:
- For the parent or the final spec review: the max(after, bot's last message) rule means that when two writers share a lesson, a writer whose `after` predates input another bot message already followed is accepted. The spec's Out of Scope line says "the cursor already refuses a writer that missed learner input". That line now holds only for input after the bot's last message. A full two-writer guard stays out of scope.
- Dropped: `lh answer --wait` returns at once when a typed message sits behind an open question. The page can't produce that state, because its composer is hidden while a question is open.
- Dropped: a skip racing an answer in the page's send route, the other direction, was already safe. The chat handler reads the record after the body.
- `docs/external-teacher.md` (named in lh's unreachable message) is still missing. It is a later ticket's deliverable.
Verified:
- `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx` after merging feat/external-teacher 1862152: 3047 tests, 3046 pass, 1 fail. The failure is the baseline Pi main-loader test.
- The new tests went red first: 9 of 10 in tests/bot-run-answers.test.ts against the pre-change code, the new lh tests against the old scripts/lh.mjs, and each review fix's test against the code before it. The race test got 200 where it expected 400, the old lh hung on `--wait=false`, and the create reply had no items.
- Review used 3 rounds. Round 1 code-review raised one hard Standards item, the unnamed `chats-changed` exception, which is fixed. Rounds 2 and 3 passed after round 3 added two missing tests. Interrogate found three bugs, all fixed with tests: `--wait=false` waited, a skip racing an answer overwrote it, and a new create left out the prompt items. Round 3 interrogate had no Act On items.
- Blast-radius skipped: Risk pre-release.
