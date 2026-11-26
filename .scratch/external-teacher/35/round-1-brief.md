# Ticket 35, review round 1 brief

Scope: `git diff feat/external-teacher...<SHA>` on branch `external-teacher-35-upstream-0-5-0`. The SHA is given in each seat's launch message. Nothing is uncommitted.

## Intent

Merge upstream LearnHarness release v0.5.0 (713377f3) into Matt's fork with a merge commit, without breaking the fork's bot-run lessons. A bot-run lesson is a lesson an outside bot teaches through the fork's HTTP API (`app/api/external/**`, `src/server/bot-run.ts`) and the `lh` CLI (`scripts/lh.mjs`). LearnHarness never calls a model for a bot-run lesson (ADR 0001, `docs/adr/0001-bot-run-lessons-write-native-records.md`). This is step 1 of 4 in the upstream catch-up. Ticket: `.scratch/external-teacher/issues/35-upstream-0-5-0.md`. Survey with risks R1-R11: `.scratch/external-teacher/upstream-0.7.0-survey.md`. Last merge for comparison: ticket 27, `.scratch/external-teacher/issues/27-merge-upstream-0-4-1.md`.

Most of the diff is upstream's own code. Review it only for what it breaks for the fork: bot-run lessons, `lh`, the graph findings route (`POST /api/external/chats/:id/findings`, `src/server/graph-findings.ts`), the bot guide (`docs/external-teacher.md`), and the fork's tests. Do not review upstream features for their own sake.

## What the merge did

- Conflict `src/store/chats.ts`: `writeChat` now calls upstream's `writeFileAtomicSync` (src/store/atomic-write.ts) with no `allowInPlaceFallback`, per D2. Before, the fork wrote its own tmp file and renamed it (ticket 16). Imports keep the fork's `ChatDriverInit` and take upstream's `ImageSnapshot`.
- Conflict `docs/architecture.md`: upstream rewrote the file; the fork's findings-route paragraph moved into the new "Read model and other writers" section.
- `tests/store-writes-atomic.test.ts` (new upstream test): the "chat" case now expects no in-place fallback.
- Auto-merged files both sides changed: components/chat.tsx, components/graph-view.tsx, components/session-core.ts, README.md, package.json, package-lock.json, src/agent/tools/plan.ts, src/agent/tools/probe.ts, src/core/contracts/chat.ts, src/core/contracts/graph.ts, src/core/index.ts, src/core/ports.ts, src/server/chat-handler.ts, src/server/index.ts.

## Settled decisions (do not relitigate)

- D1: merge by release, this step is v0.5.0 only.
- D2: chat saves keep the whole-file promise; no in-place fallback for chats. A blocked save fails and the old file stays whole.
- D4 (one shuffle function) and D5 (refuse side questions) are about code v0.5.0 does not bring (`questionDisplayOptions` and side chats arrive later). Not in this step.
- Next.js stays at 16.4.6 with no next.config.ts change.
- ADR 0001: bot-run lessons write native chat records; LearnHarness makes no model call for them.

## Fork guards to check survive

- `src/server/chat-handler.ts`: `if (isBotRun(record)) return handleBotRunInput(record, input);` in `handleChatInput`, before any model gate, compaction or turn.
- `src/server/bot-run.ts` `handleBotRunInput`: refuses `continue` and `retry` (422, code `bot_run_lesson`) and `steers` (400).
- `components/session-core.ts`: auto-wake skips when `this.botRun` is set (`continueIfOwed`).
- `components/chat.tsx`: `turnBusy = busy && !botRun`; the send path skips the zero-keys and model-picker checks when `botRun`.
- `src/core/contracts/chat.ts`: `driver`, `externalKey`, `ChatDriverInit` on the record and summary.
- `src/store/chats.ts`: whole-file chat saves; `createChat` stamps `driver`/`externalKey`.
- `src/agent/subagents/extraction.ts`: the driver check returns before any model job (ticket 08).

## Blocks

- Hardware: the Windows held-file case for D2 (another program holds a chat file open past the 100 ms rename retry). Only a Windows box shows it; bench check 7 in the survey covers it. On Linux it is modeled by `tests/store-writes-atomic.test.ts` with a faked `process.platform`.
- Machine writers: none.
- Live paths: the server's data folder. Tests set `LH_DATA_DIR` to a temp folder before importing config; the smoke script does the same. Any probe that starts the server must set `LH_DATA_DIR` to a folder inside your worktree or a `mktemp -d` folder and confirm it before running.

## Repo check

`npm ci` first in your worktree (never symlink node_modules). Then:

`npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`

Expected: one failure, "main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network" (the fork's existing baseline). The smoke is `bash .scratch/external-teacher/phase-c-smoke.sh <free port>`; its last line is PASS or FAIL.

The host is a shared 4-core box. Before a full test run, check `uptime` and wait while the 1-minute load is over 12. Prefer running only the test files your finding needs.

## Shell rules

Never `rm` on `$(...)`, variables or globs. Make scratch with `mktemp -d`. Stop only processes you started. Never run `rea setup` or `rea mcp add`, and never register REA at user scope or for Cursor, opencode or any other client.
