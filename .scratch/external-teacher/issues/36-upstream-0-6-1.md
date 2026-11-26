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
