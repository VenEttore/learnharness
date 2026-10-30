# 04: The page in a bot-run lesson

Status: open
Blocked by: 02
Risk: pre-release
Gate: none
Host: linuxdev
Touches: app/chat/[id]/page.tsx, components/chat.tsx, components/session.ts, components/session-core.ts, new test files

Phase A.

**What to build:** On a bot-run lesson with no API keys, the owner can type and answer on the page. The page never sends `continue` on its own, never opens the setup dialog when sending, and shows no "add a key" prompt. Ordinary lessons are unchanged.

- [ ] A `botRun` value goes from the lesson page through the chat view and the session hook into the session model.
- [ ] `continueIfOwed` sends nothing for a bot-run lesson, both on mount and after a sync (a session-model test for each).
- [ ] `doSend` skips the no-key and model-unavailable branches for a bot-run lesson, and the "add a key" prompt (`setupCta`) is hidden.
- [ ] A view-level render test, following the existing `render-*` tests: a keyless bot-run lesson sends typed text and shows no add-key prompt.
- [ ] Existing session-core and chat render tests pass unchanged.
- [ ] Each upstream file changes by a few lines (`session-core.ts` is near 1,000 lines).
