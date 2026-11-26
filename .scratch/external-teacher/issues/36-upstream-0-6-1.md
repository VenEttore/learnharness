# 36: Merge upstream v0.6.1

Status: claimed
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

- [ ] `git merge --no-ff v0.6.1` into the ticket branch (cut from feat/external-teacher). Resolve each conflict; record file and choice in the ticket. Keep the fork's guards: bot-run early returns in chat-handler.ts, the auto-wake gate in session-core.ts, the page's send path in chat.tsx, `driver`/`externalKey` on chat records (ADR 0001), the temp-and-rename chat save.
- [ ] Find every new upstream path in this step that can call a model or continue a lesson (routes, server actions, page auto-wake) and make sure a bot-run lesson cannot reach a model through it. Tests for each.
- [ ] If this step changes the chat record format (the survey says chats move to version 2 somewhere before 0.7.0), say so in the ticket and in the bench steps: back up the data folder before the first merged build, because an older build cannot read the new format.
- [ ] Guide (docs/external-teacher.md) and smoke: update anything this step changes for the bot.

## Check

Repo check (typecheck, lint, full tests; baseline: one failure, the Pi loader test, unless this step's upstream tests change that; say so) and `bash .scratch/external-teacher/phase-c-smoke.sh <port>` PASS.

## Bench (Gate: human, Ven through the Watcher)

On the box, after backing up the data folder: update to the ticket branch, run one real lesson through `lh` and close it per guide section 7. Check: the lesson runs with no LearnHarness model call (server log), the page never asks for a model continuation, quiz numbers from `lh show` match the card and what `lh submit` saves, the close adds facts and refuses chains, and (from 36 on) a side question in the bot-run lesson is refused.

## Comments

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
   - The lesson page `http://127.0.0.1:3000/chat/<lesson id>` loads. Before the upstream fix in this branch, every lesson page returned 500 under `next dev`.
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
