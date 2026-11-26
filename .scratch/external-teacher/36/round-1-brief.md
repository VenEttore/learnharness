# Ticket 36, review round 1 brief

Scope: `git diff origin/external-teacher-35-upstream-0-5-0...<SHA>` on branch `external-teacher-36-upstream-0-6-1`. The SHA is in each seat's launch message. Nothing is uncommitted. Ticket 35's branch is fetched as `origin/external-teacher-35-upstream-0-5-0` (tip 261a583f).

## Intent

Merge upstream LearnHarness release v0.6.1 (cb25c8e4, which includes 0.6.0) into Matt's fork with a merge commit, on top of ticket 35's v0.5.0 merge, without breaking the fork's bot-run lessons. A bot-run lesson is a lesson an outside bot teaches through the fork's HTTP API (`app/api/external/**`, `src/server/bot-run.ts`) and the `lh` CLI (`scripts/lh.mjs`). LearnHarness never calls a model for a bot-run lesson (ADR 0001, `docs/adr/0001-bot-run-lessons-write-native-records.md`). This is step 2 of 4. Ticket: `.scratch/external-teacher/issues/36-upstream-0-6-1.md`. Survey with risks R1-R11: `.scratch/external-teacher/upstream-0.7.0-survey.md`. Ticket 35 (step 1) and how it resolved things: `.scratch/external-teacher/issues/35-upstream-0-5-0.md`.

Most of the diff is upstream's own code. Review it only for what it breaks for the fork: bot-run lessons, `lh`, the graph findings route (`POST /api/external/chats/:id/findings`, `src/server/graph-findings.ts`), the bot guide (`docs/external-teacher.md`), the smoke (`.scratch/external-teacher/phase-c-smoke.sh`) and the fork's tests. Do not review upstream features for their own sake.

## What the merge did

Merge commit 1d9aa693. Eight files conflicted:

- `app/api/chats/[id]/dismiss/route.ts`: upstream's version. Upstream now re-reads the chat after the body await, which is what the fork's own re-read did, so the fork's copy is dropped. The fork's `chats-changed` emit stays.
- `components/chat.tsx`: upstream's new send path (`prepareText`, `runSubmission`). `botRun` is passed to `useChatSession`. `turnBusy = busy && !botRun` is kept on top of upstream's new `busy` (which now includes `reconciliation !== "ready"`); `busyRef` and `AbortTurnDialog` take `turnBusy`. The zero-keys and model-picker checks moved into `prepareText`, and the fork's `!botRun` skip moved with them.
- `components/session-core.ts`: the `botRun` field stays; the auto-wake gate in `continueIfOwed` is `!this.botRun && this.readyRef && ...` (upstream replaced `statusValue === "ready"` with `readyRef`).
- `src/agent/subagents/extraction.ts`: the audit-lock release takes upstream's `void prev.then(release, release)`. The fork's version (ticket 29) released at once when holding and otherwise waited for the predecessor. When holding, `prev` has already resolved, so upstream's line releases one microtask later; the abort-while-waiting case is the same.
- `src/core/contracts/chat.ts`: the fork's `driver`, `externalKey`, `ChatDriverInit` on the record and summary; upstream's comments and new fields (`sideChats`).
- `src/core/input-events.ts`, `src/store/chats.ts`: both sides' imports. `writeChat` keeps D2 (no in-place fallback).
- `src/server/chat-handler.ts`: the bot-run early return stays first after the record read, on `initialRecord`, ahead of upstream's new plugin-question checks and plugin-host lookups.

Then commit 5bb568f8 (fork work):

- `src/server/side-chat.ts` `ask()`: refuses a bot-run lesson with 422 `bot_run_lesson` before `beforeAsk` (compaction wait), `engineFor` (model and key lookup, catalog refresh) or any stream. `src/server/bot-run.ts` adds `sideQuestionRefusal()`.
- `components/chat.tsx`: a bot-run page renders no side-question button, no selection-toolbar "Ask", and ignores the side-thread shortcut.
- Tests: `tests/bot-run-side-questions.test.ts` (new), `tests/render-bot-run-lesson.test.tsx` (providers upstream's view now needs; the second-message case now expects both texts posted in order; side-button cases).
- Smoke step 8b; guide and `docs/agents/check.md` add `npm run plugins:setup` (and `plugins:build-core` for the server).

Then the fork follow-ups up to bc05e8f2:

- `tests/coverage-ring-refresh.test.tsx`, `tests/graph-view-first-load.test.tsx`: mount under `InteractionLayersProvider` (upstream's views now require it).
- Merge of ticket 39 (branch `external-teacher-39-refuse-retry-question`, 2c8b05da): `handleBotRunInput` refuses `retry-question` with 422 `bot_run_lesson`. It merged without conflict.
- `src/server/bot-run.ts`: `plugin-question-answer` and `plugin-problem-submission` are refused in `handleBotRunInput` with 422 `bot_run_lesson` (`pluginQuestionRefusal()`); `app/api/chats/[id]/dismiss/route.ts` refuses `dismiss-plugin-question` on a bot-run lesson the same way. Tests in `tests/bot-run-page-input.test.ts`.

After code-review (findings and dispositions: `.scratch/external-teacher/36/round-1-findings.md`): 9cbed63b (comment, guide, smoke and test fixes; ticket 29's unused `holding` flag removed), 96902476 (cherry-pick of upstream e8167fd7 from 0.7.0: every lesson page 500ed under `next dev`), 4f617244 (smoke and guide follow upstream's new proxy.ts Host check).

Chat records move to version 2 in this step (`CURRENT_CHAT_VERSION = 2`). A pre-merge build reads a version-2 chat as absent.

## How to read a 774-file diff

The range is mostly upstream. Three narrower views cover the fork's part:

- `git show --remerge-diff 1d9aa693`: how each of the eight conflicts was resolved, against git's own automatic merge.
- `git diff 1d9aa693 HEAD -- . ':!.scratch'`: the fork's work after the merge (including the ticket 39 merge and the upstream cherry-pick 96902476).
- `git diff v0.6.1 HEAD -- . ':!.scratch'`: every fork line on top of clean upstream v0.6.1. Compare it with ticket 35's view, `git diff v0.5.0 origin/external-teacher-35-upstream-0-5-0`, to see whether a fork guard was lost in an auto-merged file.

## Settled decisions (do not relitigate)

- D1: merge by release; this step is v0.6.1 only.
- D2: chat saves keep the whole-file promise; no in-place fallback for chats.
- D4: one shuffle function, `lh submit` shares the page's builder. `questionDisplayOptions` is not in v0.6.1 (it arrives in 0.7.0), so D4 is not in this step.
- D5: the server refuses side questions in bot-run lessons before any model call. `/btw` is not in v0.6.1.
- Next.js stays at 16.4.6 with no next.config.ts change.
- ADR 0001: bot-run lessons write native chat records; LearnHarness makes no model call for them.

## Fork guards to check survive

- `src/server/chat-handler.ts`: `if (isBotRun(initialRecord)) return handleBotRunInput(initialRecord, input);` in `handleChatInput`, before any model gate, compaction or turn.
- `src/server/bot-run.ts` `handleBotRunInput`: refuses `continue`, `retry`, `retry-question`, `plugin-question-answer` and `plugin-problem-submission` (422 `bot_run_lesson`) and `steers` (400).
- `components/session-core.ts`: auto-wake skips when `this.botRun` is set.
- `components/chat.tsx`: `turnBusy`; `prepareText` skips the zero-keys and model-picker checks when `botRun`.
- `src/core/contracts/chat.ts`, `src/store/chats.ts`: `driver`/`externalKey` stamped at birth and kept through version-2 writes and the summary spread.
- `src/agent/subagents/extraction.ts`: the driver check returns before any model job (ticket 08).

## New 0.6.x paths to attack

Try to make a bot-run lesson reach a model, or continue as a LearnHarness-taught lesson, through each:

- Side chats: `app/api/chats/[id]/side-chats/route.ts` (GET, POST), `[threadId]/route.ts` (GET watch, PATCH open), `[threadId]/stop/route.ts`; `src/server/side-chat.ts`; the page's `components/use-side-thread.ts`.
- Plugins: `app/api/plugins/**` (call, assets, documents), `app/plugins/[pluginId]/[viewId]/page.tsx`, `src/server/plugin-*.ts`, `src/server/plugins.ts` (plugin inference, agents, workers, background tools, job recovery). Core plugins in `core-plugins.json`.
- The steer route (`prepareAndSteerChat`), `GET /api/chats/:id` (plugin reconciliation), the dismiss route.
- The page: `components/chat.tsx` send, retry, retry-question and plugin submission paths; `components/session-core.ts` auto-wake and reconciliation.

## Blocks

- Machine writers: none.
- Live paths: the server's data folder. Tests set `LH_DATA_DIR` to a temp folder before importing config; the smoke does the same. Any probe that starts the server must set `LH_DATA_DIR` to a folder inside your worktree or a `mktemp -d` folder and confirm it first.

## Repo check

In your worktree: `npm ci`, then `npm run plugins:setup` (new in 0.6.0: the typecheck reads plugin sources). Never symlink node_modules. Then:

`npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`

The smoke also needs `npm run plugins:build-core` once, then `bash .scratch/external-teacher/phase-c-smoke.sh <free port>`; its last line is PASS or FAIL.

The host is a shared 4-core box. Before a full test run, check `uptime` and wait while the 1-minute load is over 12. Prefer running only the test files your finding needs.

## Shell rules

Never `rm` on `$(...)`, variables or globs. Make scratch with `mktemp -d`. Stop only processes you started. Never run `rea setup` or `rea mcp add`, and never register REA at user scope or for Cursor, opencode or any other client.
