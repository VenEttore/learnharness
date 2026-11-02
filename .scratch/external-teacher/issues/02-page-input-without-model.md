# 02: Bot-run flag; page input saved without a model

Status: resolved
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/core/contracts/chat.ts, src/store/chats.ts, src/core/ports.ts, src/server/chat-handler.ts, src/server/bot-run.ts (new), src/server/index.ts, new test files

Phase A.

**What to build:** A lesson can carry the bot-run flag. When the page sends learner input to a bot-run lesson, LearnHarness saves it and calls no model. This holds whether or not a model and key are configured. Ordinary lessons behave exactly as before.

- [x] The lesson record has an optional `driver: "external"` and an optional `externalKey`. The chat store's create takes an optional third argument to set them; existing callers are unchanged.
- [x] One commit helper saves messages and emits `record-changed` and `chats-changed`. The store's "saves stay silent" comment names this exception.
- [x] The chat handler's early return sits right after the record fetch and input parse, before every model gate, key gate and compaction. No await from read to write.
- [x] Typed text is saved. An answer to an open question is saved (the test seeds an open `ask_user_question` call). Both return the settled-turn response the parallel-question path uses.
- [x] With a model and key configured, and a compaction engine and agent builder that throw if called, neither is called.
- [x] With no model configured, typed text is saved (no 503).
- [x] Existing chat-flow tests pass unchanged.

| Failure | Caller | Returns |
|---|---|---|
| `continue` or `retry` on a bot-run lesson | page, `POST /api/chat` | 422 `{ code: "bot_run_lesson" }` |
| Any input the page doesn't send (for example an internal wake input) on a bot-run lesson | chat handler | 400 `{ code: "bot_run_lesson" }` |
| The input can't be appended (for example an answer with no open question) | page, `POST /api/chat` | 400 with the error message, as for ordinary lessons |

## Comments

### Shipped 2026-10-30
Completed:
- `ChatRecord` has optional `driver: "external"` and `externalKey`. `createChat` takes an optional third argument that stamps them. Existing callers are unchanged.
- `src/server/bot-run.ts` holds `isBotRun`, `commitBotRun` and `handleBotRunInput`. `commitBotRun` saves the messages, then emits `record-changed` and `chats-changed`. The store's silence-law comment names this exception.
- The chat handler returns early right after `getChat`, before the retry check, the model gate, the key gate and compaction. Nothing awaits between the read and the write.
- `continue` and `retry` get 422 `bot_run_lesson`. `steers` gets 400 `bot_run_lesson`. When `inputAppends` throws, the response is 400 with its message. Success returns `settledTurnResponse()`. If the save throws, the response is 500 with the same text the parallel-question path uses.
- `isBotRun` checks that `driver` is present, not that it equals "external". An unexpected stored value therefore runs no model.
- `tests/bot-run-page-input.test.ts` has 11 tests: typed text, an answer to a seeded open `ask_user_question` call, no model configured, the ordinary 503 for contrast, an over-threshold record that is not compacted, 422 for continue and retry, 400 for `next`, 400 for steers, and 400 for a stray answer.
Deferred:
- The page's automatic `continue` after a bot-run answer gets 422 until the session model's `botRun` gate lands. That is ticket 04.
- The dismiss route reads a snapshot across an await and can overwrite a concurrent write. This is upstream behavior. It goes to ticket 07, which edits that route.
Consider:
- Fail-safe driver check (`driver !== undefined`): now. It costs one line and runs no model on an odd value.
- `next` input test: now. One cheap test.
- `externalKey` comment names ticket 03 as the owner of the rerun lookup: now.
- Job pump treats the steers 400 as transient, and the artifact-ui route saves without `commitBotRun`: deferred. Both are reachable only once steers or background jobs exist on bot-run lessons, which the spec puts out of scope.
- No dedupe for duplicate text sends: deferred. Ordinary lessons have none either.
- Compaction engine and summarizer are not injectable at the handler: deferred. The spec says no new seam. The test lifts NODE_ENV for one request and asserts the preconditions (over threshold, cut index > 0). Its red run reached compaction and the summarizer (OpenRouter returned 401).
- The save, announce and 500 sequence appears twice, and the ChatInputError-to-400 idiom repeats: deferred, to keep upstream edits small.
- No test for the key-absent case or the 500 branch: deferred. The no-model test already sits in front of both gates.
Verified:
- `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx` was run after merging the integration tip. Typecheck and lint are clean. Of 2950 tests, 2949 pass and 1 fails: "main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network", the baseline failure.
- `tests/bot-run-page-input.test.ts`: 11 of 11 pass. They were red before the handler edit.
- Review used two rounds out of 3. Code-review passed both rounds on both axes. Interrogate round 1 had 2 Act On items, both fixed in fd0c882: the test key is now set unconditionally, and NODE_ENV is restored correctly. Round 2 had no Act On items.
- Blast radius: skipped, because the ticket is Risk: pre-release.
