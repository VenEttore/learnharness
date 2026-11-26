# Ticket 36, round 1 findings

## Code-review, Standards (Opus 5.5 xhigh, at 7f1ee49b): 7 findings

1. Hard. `extraction.ts` kept ticket 29's `holding` flag, now unused. Fixed in 9cbed63b (both lines removed; the file matches upstream there).
2. Hard. `bot-run.ts` `BOT_RUN_LESSON_CODE` comment listed too few refusals. Fixed in 9cbed63b.
3. Hard. `handleBotRunInput` comment left out the plugin inputs. Fixed in 9cbed63b.
4. Judgement. `turnBusy` comment hid that it also gates submissions and skips the reconciliation wait. Comment fixed in 9cbed63b. No code change: reconciliation starts only when a lesson holds plugin questions, and a bot-run lesson holds none.
5. Judgement. "D5 in external-teacher 36" in code comments. Fixed in 9cbed63b (cites ADR 0001).
6. Nit. `first` in `side-chat.ts`. Renamed `beforeWait` in 9cbed63b.
7. Guide wording on `plugins:setup` and `build-authoring`. Fixed in 9cbed63b.

## Code-review, Spec (Opus 5.5 xhigh, at 7f1ee49b): 4 findings

1. Partial. Guide update section had no backup step or format-2 warning. Fixed in 9cbed63b.
2. Partial. Smoke 8b's side retry checked status only; no route-level follow-up or retry test. Fixed in 9cbed63b (smoke checks the code; tests/bot-run-side-questions.test.ts adds the route case).
3. Scope. The page also hides side-question entry points; the toolbar "Ask" removal has no test. Kept, not tested: the selection toolbar needs a live text selection, which linkedom does not provide. The server refusal is the guard; the toolbar is UI only.
4. Same as Standards 1. Fixed.

## Found by the parent's smoke at ca926dec (after code-review)

- Every lesson page returned 500 under `next dev`: "Cannot add property changed, object is not extensible" in upstream's chat.tsx (React's dev server renderer seals useRef objects). An upstream v0.6.1 bug, fixed upstream in 0.7.0 by e8167fd7. Cherry-picked as 96902476 with its test, tests/chat-dev-render.test.tsx.
- Forged-Host check: since 0.6.0 upstream's proxy.ts refuses a Host that is neither localhost nor an IP (403, `{error}`, no code) before the fork's check. Not a regression: the request is still refused. Smoke and guide updated in 4f617244; the fork's `forbidden_host` still covers a non-loopback IP Host.
- `lh graph propositions` timed out at 30 s while that route compiled under load (29.8 s in the log). Environmental; passed on the rerun.

Smoke at 4f617244: PASS, 122 ok lines.
