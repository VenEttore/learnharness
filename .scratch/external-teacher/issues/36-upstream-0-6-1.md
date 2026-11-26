# 36: Merge upstream v0.6.1

Status: resolved
Blocked by: 35
Risk: pre-release
Gate: human (Ven runs one real lesson on the merged build)
Host: linuxdev
Touches: the conflicted and auto-merged upstream files of this step (see the survey for the full list at upstream/main), fork guards in chat-handler.ts, session-core.ts, chat.tsx, store/chats.ts, question-dock.tsx, docs/external-teacher.md, phase-c-smoke.sh, tests

Step 2 of 4. Side questions arrive in 0.6.0: decision D5 applies here. Target: v0.6.1 (cb25c8e4).

Matt's decisions (2026-11-26, from the ticket 34 survey, .scratch/external-teacher/upstream-0.7.0-survey.md). Apply each one in the step that brings the code it is about:
- D1: merge in steps by release, one ticket per step (35 to 38).
- D2: chat saves keep the fork's whole-file promise (ticket 16). Turn upstream's Windows in-place fallback off for chat saves: a blocked save fails and the old file stays whole.
- D4: one shuffle function. `lh submit`'s builder (`questionDataOf`) calls upstream's `questionDisplayOptions`, so the page and `lh` share it. Answers saved by the page and by `lh submit` for the same number stay identical.
- D5: the server refuses side questions (side chats, `/btw`) in bot-run lessons, at the route, before any model call. LearnHarness never calls a model for a bot-run lesson.
- Next.js `agentUpgrade` stays at Next's default (no next.config.ts change).

## Work

- [x] `git merge --no-ff v0.6.1` into the ticket branch (cut from feat/external-teacher). Resolve each conflict; record file and choice in the ticket. Keep the fork's guards: bot-run early returns in chat-handler.ts, the auto-wake gate in session-core.ts, the page's send path in chat.tsx, `driver`/`externalKey` on chat records (ADR 0001), the temp-and-rename chat save.
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
- Built on ticket 35's branch (261a583f) with feat's newest .scratch files merged in (9c37de17). Merged upstream v0.6.1 (cb25c8e4) with a merge commit, 1d9aa693. Eight files conflicted:
  - app/api/chats/[id]/dismiss/route.ts: took upstream's version. Upstream now re-reads the chat after the body await, which is what the fork's own re-read did, so the fork's copy is gone. The fork's `chats-changed` emit stays.
  - components/chat.tsx: took upstream's new send path (`prepareText`). `botRun` is passed to `useChatSession`. `turnBusy = busy && !botRun` sits on top of upstream's new `busy`, and `busyRef` and the abort dialog use it. The zero-keys and model-picker checks moved into `prepareText`, and the fork's `!botRun` skip moved with them.
  - components/session-core.ts: kept the `botRun` field. The auto-wake gate is now `!this.botRun && this.readyRef && ...`, because upstream replaced `statusValue === "ready"` with `readyRef`.
  - src/agent/subagents/extraction.ts: took upstream's audit-lock release, `void prev.then(release, release)`. A holder's `prev` has already resolved, so it releases one microtask later. Seat D's probe passes with this line and fails with an immediate release.
  - src/core/contracts/chat.ts: kept the fork's `driver`, `externalKey` and `ChatDriverInit`, with upstream's comments and new fields.
  - src/core/input-events.ts, src/store/chats.ts: kept both sides' imports. `writeChat` keeps D2.
  - src/server/chat-handler.ts: the bot-run early return stays first, on `initialRecord`, ahead of upstream's plugin-question checks and plugin-host lookups.
- Chat records move to version 2 in this step (`CURRENT_CHAT_VERSION = 2`). Ticket 35's build reads a version-2 lesson as missing. Version-1 lessons still read, and they are rewritten as version 2 with `driver` and `externalKey` on their next save (seat B ran this end to end). The bench backs up the data folder first, and the guide's update section now says to back up before an update.
- D5, side questions: `sideChats.ask` (src/server/side-chat.ts) refuses a bot-run lesson with 422 `bot_run_lesson`. It checks before the compaction wait, and again on the record the engine lookup receives. That covers the first question, follow-ups, retries and requestId replays. The page hides the side-question button, the selection-toolbar "Ask" and the Ctrl+J side-thread shortcut when `botRun` is set. Tests: tests/bot-run-side-questions.test.ts (service and real route, with ordinary-lesson controls; red without the guard) and tests/render-bot-run-lesson.test.tsx. Smoke step 8b sends the page's side-question POST and a retry, and gets 422 `bot_run_lesson` with the chat file unchanged. `/btw` is not in this step: upstream added it and then removed it before v0.6.1 (b9bc6f0b).
- Plugin input (a finding from ticket 39's review): `plugin-question-answer` and `plugin-problem-submission` get 422 `bot_run_lesson` in `handleBotRunInput`, and `dismiss-plugin-question` gets the same from the dismiss route. A Bot Teacher poses no plugin question or problem, and plugins grade them. Tests in tests/bot-run-page-input.test.ts went red, then green. (mechanism: plugin-inputs-not-refused)
- Merged ticket 39 (2c8b05da, refuse `retry-question`). No conflict.
- Model-call paths new in 0.6.x, checked for bot-run lessons. Seat A's 10-test probe pinned a model, set a fake key and enabled all four core plugins. Every path counted 0 agent builds, 0 engine lookups and 0 provider fetches, and every ordinary-lesson control counted at least 1. The paths: `POST /api/chat` with every input type; all four side-chat routes; the steer route; `GET /api/chats/:id` with plugin reconciliation; native and plugin dismissals; plugin calls; and plugin job recovery. Flashcards' model use is a graph-wide action the learner starts, not a call inside a lesson.
- Upstream fix taken early: upstream v0.6.1's chat page threw "Cannot add property changed, object is not extensible" under `next dev`, so every lesson page returned 500. Upstream fixed it in 0.7.0 (e8167fd7). Cherry-picked as 96902476, with its test, tests/chat-dev-render.test.tsx. Step 3 will merge it cleanly. (mechanism: upstream-dev-render-ref-seal)
- Test harness: three fork render tests now mount under the providers that upstream's views need since 0.6.0 (`InteractionLayersProvider`, app router, pathname). The second-message case in render-bot-run-lesson changed with upstream's send path. A message typed while the first send settles is now posted as text right after it, not held in the composer. It is not steered and not lost (seat C found the same with a pending POST, where upstream's submission runner holds it).
- Plugin API reference (docs/plugin-api, new in 0.6.0, generated): regenerated, so it lists the fork's `ChatDriver`, `driver`/`externalKey` and graph `source` fields (c6f0a795). (mechanism: generated-reference-stale)
- Guide: install and update now run `npm run plugins:setup && npm run plugins:build-core`; the update section says to back up the data folder before updating, because of format 2; the refusal table says a non-IP host name gets upstream's 403 `{error}` with no code. docs/agents/check.md adds `npm run plugins:setup`. ADR 0001 has an update line for side questions and plugin input.
- Smoke: step 8b (side question and retry refused). Step 3 now expects upstream's proxy.ts 403 for a forged host name, and the fork's `forbidden_host` for a forged non-loopback IP. (mechanism: smoke-host-check-moved-upstream)
- Round 1 review fixes (9cbed63b): ticket 29's `holding` flag was dead after the merge, so it is removed (mechanism: dead-fork-line-after-merge). `bot-run.ts` comments now list every refusal and cite ADR 0001 (mechanism: fork-comment-mismatch). The guide's update section gains the backup step (mechanism: guide-missing-format-backup). Smoke 8b's retry check now tests the refusal code (mechanism: smoke-refusal-code-unchecked). The side-question guard now also checks the record the engine gets (4b2f5a5e) (mechanism: guard-reads-other-record).

Decisions in this step:
- D1: this is step 2 of 4.
- D2: kept. No in-place fallback for chat saves; tests/store-writes-atomic.test.ts passes.
- D4: not in this step. `questionDisplayOptions` is not in v0.6.1, and the dock and `lh submit` still share `questionDataOf`.
- D5: applied, as described above.
- Next.js stays 16.4.6, with no next.config.ts change. `next dev` printed no upgrade notice. AGENTS.md takes upstream's level-two heading for the Next.js block, and the fork section stays below it.

Deferred:
- The toolbar "Ask" removal has no test: the selection toolbar needs a live text selection, which linkedom lacks. The server refusal is the guard.
- Seat A's trigger for the side-question read gap (a failed read on Windows) is not shown on hardware. The fix closes it in code.
- `npm run dev` and `npm run start` now bind `-H localhost` (survey R6). The guide starts `npx next dev -H 127.0.0.1` directly, so the box is not affected. `npm run dev` itself was not checked on the box.
- The upstream test failures listed under Verified are upstream's own (they fail on clean v0.6.1). Step 3 should recheck "installed Next forced-clone control": v0.7.0 pins Next 16.4.6 and leaves that test unchanged.
- Page polish from ticket 39 (raw JSON banner on a 422) is unchanged here.

Verified:
- Repo check at 9158c1ab (code matches the tip), after `npm ci && npm run plugins:setup`: `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`. Typecheck and lint pass (lint has 1 warning, in upstream's tests/source-name-ui.test.tsx). Tests: 5653 run, 5646 pass, 3 fail, 4 skipped. The failures: "waits a cold 500ms, opens focus immediately, and never creates an interaction owner" (passive-tooltip; Node 22.23.4's MockTimers warning lands in its console-error check), "installed Next forced-clone control demonstrates the previous oversized-epilogue acceptance" (plugin-document-proxy), and the Pi loader baseline. One run, at load 7 to 18.
- Clean upstream v0.6.1 (cb25c8e4) in its own worktree, same check, same box: typecheck and lint pass. Tests: 5327 run, 5314 pass, 9 fail, 4 skipped. Its failures include all three above, plus three subscription-auth tests, one document-API test and two SDK type tests, which pass on the merge. The run went at load up to 41, so some of those are load or timeout flakes. No failure on the merge is missing from the clean upstream run.
- An earlier merged run at bc05e8f2 had one more failure, tests/plugin-api-reference.test.ts, which was fixed in c6f0a795 and passes alone (4/4).
- `bash .scratch/external-teacher/phase-c-smoke.sh 3938` at 9158c1ab: PASS, 122 ok lines, 0 FAIL. It includes "page /chat/<id> answers 200", "side question refused: 422 bot_run_lesson", "side retry refused: 422 bot_run_lesson", "forged non-loopback IP Host is refused (forbidden_host)" and "the server log shows no model turn and no error". An earlier PASS was at 4f617244. Run 1, at ca926dec, failed four checks (the page 500, the host check, a 30 s compile timeout, and the log error), and those led to the fixes above.
- Findings path and `lh` on version-2 chats: tests/graph-findings.test.ts 31/31 (including ticket 29's abort-while-waiting case). Seat B's end to end: `lh findings` with a chain gives 400 `chains_not_accepted`; without one, `merged:true`, `newFacts:1` and `learnerLine`; a resend gives `alreadyRead:true`.
- Review round 1 (rounds used: 1 of 8). Code-review Standards and Spec ran on Opus 5.5 xhigh, at 7f1ee49b; their 11 findings were fixed or answered. Interrogate ran at 9c1d7275. Seat A was Opus 5.5 xhigh (1 finding, fixed). Seat B was DeepSeek V4.1 Flash on OpenCode Go, variant high (1 finding, already fixed). Seat C was Haiku 5.5 xhigh (0). Seat D ran on its fallback, Sonnet 5.5 high, after Composer 2.5 failed to start twice (0). Findings and dispositions: .scratch/external-teacher/36/round-1-findings.md. The post-review delta (4 lines in side-chat.ts plus generated docs) ships unreviewed under the small-diff rule.
- blast-radius: skipped (Risk: pre-release).

## Bench steps for Ven (Gate: human)

On the box, through the Watcher. This build moves lessons to chat format 2. Ticket 35's build reads a format-2 lesson as missing, so step 2 is required.

1. Stop the running LearnHarness (the process started by guide section 1, step 4).
2. Back up the data folder: `cp -a /workspace/lh-data /workspace/lh-data.before-36`.
3. Update to the ticket branch:
   ```bash
   cd /workspace/learnharness
   git fetch origin external-teacher-36-upstream-0-6-1
   git checkout -B external-teacher-36-upstream-0-6-1 FETCH_HEAD
   git log --oneline -1   # the SHA in the handoff
   npm ci && npm run plugins:setup && npm run plugins:build-core
   ```
   `plugins:setup` and `plugins:build-core` are new in this step (guide section 1, step 2). Without `plugins:build-core`, the server starts with no core plugins.
4. Start the server as in guide section 1, step 4, and check it as in step 5.
5. Open an older lesson from before this update (`lh show <an old lesson id>`). It must still read. It is saved in format 2 the next time it changes.
6. Run one real lesson through `lh`: probe, probe done, plan, teaching questions, and close it per guide section 7 (findings into the graph).
7. Checks:
   - `grep -iE 'turn refused|models_not_configured|Error:|agent|provider|api key|not extensible' /workspace/lh-server.log` prints nothing: no LearnHarness model turn and no error.
   - The lesson page `http://127.0.0.1:3000/chat/<lesson id>` loads. Before the upstream fix in this branch, every lesson page returned 500 under `next dev`. The two old Bench 2 test lessons from ticket 35's bench (chat_mvzen211_0a859d0f, chat_mvzenc8e_74316c4b) still return 500 with `saved.map is not a function`; that is ticket 40, not this step.
   - With the lesson page open after a learner answer, the page sends no `continue`. The lesson never shows a model "thinking" state, and the log has no `POST /api/chat` with `continue`.
   - Quiz numbers from `lh show` match the question card and what `lh submit` saves, in the same order.
   - The close adds facts (`merged: true`, `newFacts` above 0), and a findings call that carries a chain is refused with `chains_not_accepted`.
   - Side questions are refused. On the lesson page, teacher text shows no side-question button (a small speech-bubble icon under the text), selecting teacher text shows no "Ask" button, and Ctrl+J opens no side panel. Then send the page's side-question request by hand and check the refusal:
     ```bash
     L=<lesson id>
     M=$(lh show "$L" | jq -r '[.messages[] | select(.role=="assistant") | .id] | last')
     curl -s -X POST "http://127.0.0.1:3000/api/chats/$L/side-chats" \
       -H 'Content-Type: application/json' -H 'Origin: http://127.0.0.1:3000' \
       --data "{\"anchor\":{\"messageId\":\"$M\",\"partId\":\"$M-t0\",\"blockIndex\":0,\"blockText\":\"x\"},\"text\":\"why?\"}"
     ```
     The reply is `{"error":"A bot-run lesson has no LearnHarness model to answer side questions.","code":"bot_run_lesson"}`, and the server log shows no model call after it.
   - Optional, Windows only (survey bench check 7): save a chat while another program holds its file open. The save fails with an error, and the old file stays whole.
8. Report pass or fail, with the server log lines for any failing check.

Rollback to ticket 35's build:
1. Stop the server.
2. `cd /workspace/learnharness && git fetch origin external-teacher-35-upstream-0-5-0 && git checkout -B external-teacher-35-upstream-0-5-0 FETCH_HEAD && npm ci`.
3. Put the backup back: `mv /workspace/lh-data /workspace/lh-data.after-36 && cp -a /workspace/lh-data.before-36 /workspace/lh-data`. Lessons made or changed on this build are format 2, so ticket 35's build cannot read them. They stay in `/workspace/lh-data.after-36` for the next forward update.
4. Start the server as in guide section 1, step 4.
