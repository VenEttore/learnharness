# 35: Merge upstream v0.5.0

Status: resolved
Blocked by: 34
Risk: pre-release
Gate: human (Ven runs one real lesson on the merged build)
Host: linuxdev
Touches: the conflicted and auto-merged upstream files of this step (see the survey for the full list at upstream/main), fork guards in chat-handler.ts, session-core.ts, chat.tsx, store/chats.ts, question-dock.tsx, docs/external-teacher.md, phase-c-smoke.sh, tests

Step 1 of 4. Target: v0.5.0 (713377f3).

Matt's decisions (2026-11-26, from the ticket 34 survey, .scratch/external-teacher/upstream-0.7.0-survey.md). Apply each one in the step that brings the code it is about:
- D1: merge in steps by release, one ticket per step (35 to 38).
- D2: chat saves keep the fork's whole-file promise (ticket 16). Turn upstream's Windows in-place fallback off for chat saves: a blocked save fails and the old file stays whole.
- D4: one shuffle function. `lh submit`'s builder (`questionDataOf`) calls upstream's `questionDisplayOptions`, so the page and `lh` share it. Answers saved by the page and by `lh submit` for the same number stay identical.
- D5: the server refuses side questions (side chats, `/btw`) in bot-run lessons, at the route, before any model call. LearnHarness never calls a model for a bot-run lesson.
- Next.js `agentUpgrade` stays at Next's default (no next.config.ts change).

## Work

- [x] `git merge --no-ff v0.5.0` into the ticket branch (cut from feat/external-teacher). Resolve each conflict; record file and choice in the ticket. Keep the fork's guards: bot-run early returns in chat-handler.ts, the auto-wake gate in session-core.ts, the page's send path in chat.tsx, `driver`/`externalKey` on chat records (ADR 0001), the temp-and-rename chat save.
- [x] Find every new upstream path in this step that can call a model or continue a lesson (routes, server actions, page auto-wake) and make sure a bot-run lesson cannot reach a model through it. Tests for each.
- [x] If this step changes the chat record format (the survey says chats move to version 2 somewhere before 0.7.0), say so in the ticket and in the bench steps: back up the data folder before the first merged build, because an older build cannot read the new format.
- [x] Guide (docs/external-teacher.md) and smoke: update anything this step changes for the bot.

## Check

Repo check (typecheck, lint, full tests; baseline: one failure, the Pi loader test, unless this step's upstream tests change that; say so) and `bash .scratch/external-teacher/phase-c-smoke.sh <port>` PASS.

## Bench (Gate: human, Ven through the Watcher)

On the box, after backing up the data folder: update to the ticket branch, run one real lesson through `lh` and close it per guide section 7. Check: the lesson runs with no LearnHarness model call (server log), the page never asks for a model continuation, quiz numbers from `lh show` match the card and what `lh submit` saves, the close adds facts and refuses chains, and (from 36 on) a side question in the bot-run lesson is refused.

## Comments

### Shipped 2026-11-26 (code; Gate: human still open for Ven's bench)

Completed:
- Merged upstream v0.5.0 (713377f3) with a merge commit, 52b07e6b. Two files conflicted:
  - src/store/chats.ts: `writeChat` calls upstream's `writeFileAtomicSync` (src/store/atomic-write.ts: temp file, fsync, rename, about 100 ms of rename retries on Windows) with no `allowInPlaceFallback`. This applies D2: when Windows still holds the file after the retries, the save throws and the old file stays whole. It replaces the fork's own temp-and-rename from ticket 16. The imports keep the fork's `ChatDriverInit` and take upstream's `ImageSnapshot`.
  - docs/architecture.md: upstream rewrote the whole file in its docs reorganization. The resolution takes upstream's file and puts the fork's one paragraph (the findings route) back in the new "Read model and other writers" section.
- tests/store-writes-atomic.test.ts (new upstream test): its "chat" case now expects no in-place fallback, per D2.
- Git merged the other 14 files that both sides changed on its own. Round-1 code-review compared each file's fork lines against v0.5.0 with the fork's lines against v0.4.1 before the merge, and they match. The fork guards are intact: the bot-run early return in `handleChatInput` (chat-handler.ts:212), the auto-wake gate (session-core.ts:965), `turnBusy` and the send path's `botRun` checks in chat.tsx, `driver`/`externalKey` on the record and summary, and extraction's driver check. AGENTS.md keeps the fork section below the Next.js block. Next.js stays at 16.4.6, and next.config.ts is unchanged.
- Model-call paths new in v0.5.0, checked for bot-run lessons. None can reach a model:
  - `GET /api/chats/:id/images/:snapshotId` only reads. `GET /api/chats/:id` now leaves `imageSnapshots` out of its reply, and the fork's external read builds its own reply.
  - The settings and search route changes add search engines and settings fields and make no model call.
  - The file-access policy, `show_image`, learner images, the visual maker, annotation SVG, the PDF reader and the narration guard run only inside a model turn or a job. A bot-run lesson returns before a turn at chat-handler.ts:212. No bot turn kind creates a job, and `createJob` is called only from src/agent/tools/jobs.ts.
  - The page's attach button only puts quoted file paths into the draft. In a bot-run lesson that text is saved like any page text.
  - session-core's change only drops duplicate messages by id when it adopts a record. Auto-wake is unchanged.
  - No new test was needed, because no new reachable path exists. The existing tests cover the refusals: tests/bot-run-page-input.test.ts checks that `continue` and `retry` get 422 `bot_run_lesson` and that `steers` gets 400. Interrogate C's probe (15 tests, not committed) created each lesson through the external route and pinned a real model with a key present. Every page and server path gave 0 agent builds and 0 model calls. Its control, an ordinary lesson, gave 1 of each.
- The open survey item: `handleBotRunInput` (src/server/bot-run.ts:77) does refuse `continue` for a bot-run lesson, with 422 and code `bot_run_lesson`, before any model gate. No new refusal was needed.
- Chat record format: this step does not change it. `CURRENT_CHAT_VERSION` stays 1. Version 2 is upstream commit 58aade5b, which is in 0.6.0. The one change is an optional `imageSnapshots` field that only model turns write. A pre-merge build can still read every chat this build writes. The bench steps still back up the data folder, because it is cheap and step 2 (ticket 36) will need it.
- Guide and smoke: this step changes nothing the bot uses: the start lines, the `lh` replies, the refusal codes and the routes are the same. Neither file changed. Interrogate D ran a whole lesson by the guide's own examples on the merged server, and it matched the guide.
- Round-1 Standards fix: the `writeChat` docstring credited upstream's atomic writer to the fork; it is back to upstream's text (1962bfb2). (mechanism: fork-comment-credits-upstream)

Decisions in this step:
- D1: this is step 1 of 4.
- D2: applied (src/store/chats.ts and its test).
- D4 and D5: not in this step. v0.5.0 has neither `questionDisplayOptions` nor side chats.
- Next.js `agentUpgrade`: no next.config.ts change, and `next dev` printed no upgrade notice.

Deferred:
- `retry-question` from the page in a bot-run lesson. The page sends it with no `botRun` check (components/chat.tsx:1604). The server accepts it and appends a tool result asking for the question again. No model runs, and the bot route checks every question, so a bot cannot write a malformed one. Ticket 27 deferred the same thing, and this step did not change it. Interrogate C's pick: refuse it in `handleBotRunInput` with a 422. Waiting on Matt.
- `recoverStaleJobs` (src/server/jobs.ts:736) respawns any running job row with no driver check. No route writes a job row for a bot-run lesson, so it cannot run today. Not filed. A one-line driver guard would close it if a later step lets a bot-run lesson write jobs.
- Two tests now check the whole-file chat save (the fork's tests/chat-atomic-write.test.ts and upstream's store-writes-atomic chat case). Both are kept, because the fork test also covers a disk filling up partway through the write.

Verified:
- Repo check at 52b07e6b, after `npm ci` on the merged lockfile (`npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`): typecheck and lint pass. Tests: 3858 run, 3853 pass, 1 fail, 4 skipped. The failure is "main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network", the existing baseline. Interrogate A, B, C and D each reran it in their own worktrees at fa29bc7d and got the same counts.
- Clean upstream v0.5.0 (713377f3) in its own worktree, same check: typecheck and lint pass. Tests: 3547 run, 3542 pass, 1 fail (the same Pi loader test), 4 skipped. v0.5.0 brings no new failure.
- After the docstring fix, at 1962bfb2: typecheck passes, eslint on chats.ts passes, and store-writes-atomic, chat-atomic-write, atomic-write and bot-run-page-input give 60 tests: 59 pass, 0 fail, 1 skipped (upstream's Windows-only rename test). The change is 3 comment lines, so the small-diff rule covers it and no review round has read it.
- `bash .scratch/external-teacher/phase-c-smoke.sh 3135` at 52b07e6b: PASS, 117 ok lines, 0 FAIL, including "ok: the server log shows no model turn and no error". Seats A and C reran it at fa29bc7d (ports 3815 and 3917): PASS both times.
- D2 on Linux is modeled by faking `process.platform`. Interrogate A made every rename fail with EBUSY, then tried a lesson create, a bot `say` and page text: each returned 500, left the chat file byte-identical, left no temp file, and worked on retry. Interrogate B crashed a save between the temp write and the rename: the old file stayed whole, and `listChats` listed the lesson once. A real held file on Windows is bench check 7 and was not run.
- Review round 1 (rounds used: 1 of 8). Code-review Standards and Spec ran on Opus 5.5 xhigh. Interrogate: A Opus 5.5 xhigh, B DeepSeek V4.1 Flash on OpenCode Go (variant high), C Haiku 5.5 xhigh, D on its fallback, Sonnet 5.5 high, after Composer 2.5 failed to start twice ("Cursor Agent SDK worker.register failed"). Interrogate found nothing (0, 0, 0, 0). Findings and dispositions: .scratch/external-teacher/35/round-1-findings.md.
- blast-radius: skipped (Risk: pre-release).

## Bench steps for Ven (Gate: human)

On the box, through the Watcher:

1. Stop the running LearnHarness (the process started by guide section 1, step 4).
2. Back up the data folder: `cp -a /workspace/lh-data /workspace/lh-data.before-35`. This step keeps chat records at version 1, so an older build can still read them. The backup is for safety, and step 2 (ticket 36) will need one.
3. Update to the ticket branch:
   ```bash
   cd /workspace/learnharness
   git fetch origin external-teacher-35-upstream-0-5-0
   git checkout -B external-teacher-35-upstream-0-5-0 FETCH_HEAD
   git log --oneline -1   # the SHA in the handoff
   npm ci
   ```
4. Start the server as in guide section 1, step 4, and check it as in step 5.
5. Run one real lesson through `lh`: probe, probe done, plan, teaching questions, and close it per guide section 7 (findings into the graph).
6. Checks:
   - `grep -iE 'turn refused|models_not_configured|Error:|agent|provider|api key' /workspace/lh-server.log` prints nothing (the smoke's own "no model ran" check): no LearnHarness model turn and no error.
   - With the lesson page open after a learner answer, the page sends no `continue` (the lesson never shows a model "thinking" state, and the log has no `POST /api/chat` with `continue`).
   - Quiz numbers from `lh show` match the question card and what `lh submit` saves, in the same order.
   - The close adds facts (`merged: true`, `newFacts` above 0), and a findings call that carries a chain is refused with `chains_not_accepted`.
   - Side questions arrive in 0.6.0 (ticket 36), so there is no side-question check in this step.
   - Optional, Windows only (bench check 7): save a chat while another program holds its file open. The save fails with an error, and the old file stays whole.
7. Report pass or fail with the server log lines for the failing check. To roll back: stop the server, `git checkout feat/external-teacher` (or the earlier branch), `npm ci`, and restore `/workspace/lh-data.before-35` if anything in it looks wrong.
