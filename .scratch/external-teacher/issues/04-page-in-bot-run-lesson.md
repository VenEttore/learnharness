# 04: The page in a bot-run lesson

Status: resolved
Blocked by: 02
Risk: pre-release
Gate: none
Host: linuxdev
Touches: app/chat/[id]/page.tsx, components/chat.tsx, components/session.ts, components/session-core.ts, new test files

Phase A.

**What to build:** On a bot-run lesson with no API keys, the owner can type and answer on the page. The page never sends `continue` on its own, never opens the setup dialog when sending, and shows no "add a key" prompt. Ordinary lessons are unchanged.

- [x] A `botRun` value goes from the lesson page through the chat view and the session hook into the session model.
- [x] `continueIfOwed` sends nothing for a bot-run lesson, both on mount and after a sync (a session-model test for each).
- [x] `doSend` skips the no-key and model-unavailable branches for a bot-run lesson, and the "add a key" prompt (`setupCta`) is hidden.
- [x] A view-level render test, following the existing `render-*` tests: a keyless bot-run lesson sends typed text and shows no add-key prompt.
- [x] Existing session-core and chat render tests pass unchanged.
- [x] Each upstream file changes by a few lines (`session-core.ts` is near 1,000 lines).

## Comments

### Shipped 2026-10-31
Completed:
- `botRun` goes from `app/chat/[id]/page.tsx` (`isBotRun(chat)`) through `Chat` and `useChatSession` into `SessionModel`.
- `continueIfOwed` sends nothing for a bot-run lesson, on mount and after a sync.
- `doSend` skips the no-key and model-unavailable checks for a bot-run lesson, and `setupCta` is hidden.
- `turnBusy = busy && !botRun` gates steer, the composer's Stop, the Esc turn abort, and `AbortTurnDialog`. Typed text in a bot-run lesson is never turned into a steer.
- Tests: `tests/bot-run-session.test.ts` (session model), `tests/render-bot-run-lesson.test.tsx` (keyless view), `tests/bot-run-lesson-page.test.tsx` (the page passes `botRun` from the record).
Deferred: none. One note from round 4: a Dismiss or answer clicked while the owner's own send is still attaching to the stream is dropped. That is upstream's `readyRef` gate in `session-core.ts`, and ordinary lessons behave the same way. For a bot-run lesson the stream route returns the settled terminal at once (there is never a running turn), so the window is one local request. Dropped, not ticketed.
Verified:
- Full check after merging feat/external-teacher (ece5caa): `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx` gave 2974 tests, 2973 pass, 1 fail. The failure is the baseline Pi main-loader test.
- `npx next build`: exit 0. The regenerated next-env.d.ts was restored and not committed.
- Deleting `botRun={isBotRun(chat)}` from the page fails both page tests (0/2). Restoring it passes them.
- Review round 4 (rounds 4 of 8): code-review passed on Standards and Spec. Interrogate seats A grok-4.7, B glm-5p3-flash, C haiku-5-5 and D composer-2.5 all ran. Act On: none. A's one finding was dropped as described under Deferred.
- Blast radius: skipped (Risk: pre-release).
