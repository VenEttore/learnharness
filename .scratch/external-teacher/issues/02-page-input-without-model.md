# 02: Bot-run flag; page input saved without a model

Status: open
Blocked by: none
Risk: pre-release
Gate: none
Host: laptop
Touches: src/core/contracts/chat.ts, src/store/chats.ts, src/core/ports.ts, src/server/chat-handler.ts, src/server/bot-run.ts (new), src/server/index.ts, new test files

Phase A.

**What to build:** A lesson can carry the bot-run flag. When the page sends learner input to a bot-run lesson, LearnHarness saves it and calls no model. This holds whether or not a model and key are configured. Ordinary lessons behave exactly as before.

- [ ] The lesson record has an optional `driver: "external"` and an optional `externalKey`. The chat store's create takes an optional third argument to set them; existing callers are unchanged.
- [ ] One commit helper saves messages and emits `record-changed` and `chats-changed`. The store's "saves stay silent" comment names this exception.
- [ ] The chat handler's early return sits right after the record fetch and input parse, before every model gate, key gate and compaction. No await from read to write.
- [ ] Typed text is saved. An answer to an open question is saved (the test seeds an open `ask_user_question` call). Both return the settled-turn response the parallel-question path uses.
- [ ] With a model and key configured, and a compaction engine and agent builder that throw if called, neither is called.
- [ ] With no model configured, typed text is saved (no 503).
- [ ] Existing chat-flow tests pass unchanged.

| Failure | Caller | Returns |
|---|---|---|
| `continue` or `retry` on a bot-run lesson | page, `POST /api/chat` | 422 `{ code: "bot_run_lesson" }` |
| Any input the page doesn't send (for example an internal wake input) on a bot-run lesson | chat handler | 400 `{ code: "bot_run_lesson" }` |
| The input can't be appended (for example an answer with no open question) | page, `POST /api/chat` | 400 with the error message, as for ordinary lessons |
