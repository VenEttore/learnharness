# 09: Verify phase B

Status: resolved
Blocked by: 06, 07, 08
Risk: pre-release
Gate: none
Host: linuxdev
Touches: unknown

Phase B verification.

**What to build:** Run the phase check.

- [x] The repo check passes, with no failures outside the baseline.
- [x] Smoke run against a dev server listening on 127.0.0.1, with no API keys:
  - `lh probe`, then an answer through `POST /api/chat`, then `lh answer` shows the full answer item;
  - `lh ask`, then a skip through the dismiss route, then `lh answer` shows the skip;
  - `lh answer --wait --timeout 3` with nothing new exits 2.

## Comments

### Shipped 2026-10-31
Completed: ran the phase B check (repo check and smoke run). No code changes were needed.
Deferred: none. docs/external-teacher.md, the guide `lh` points to, is ticket 13.
Verified:
- Repo check (`npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx`): typecheck and lint clean; 3047 tests, 3046 pass, 1 fail. The one failure is the baseline Pi main-loader test.
  - The first full run also failed `browser-service shipping readiness` ("waits through delayed/non-200 startup..."). The test's local server got a `GET /` it never sent, likely stray traffic on the shared host while the smoke dev server was up. Then 5 of 5 isolated runs of tests/browser-service-readiness.test.ts passed, and so did the full rerun above. No external-teacher commit touches that file.
- Smoke run: `next dev -H 127.0.0.1 -p 3591`, fresh temp `LH_DATA_DIR`, no API keys in the environment, `LH_URL=http://127.0.0.1:3591`.
  - `lh lesson new`, then `lh probe` with a two-option probe: ok. `lh show` reported it as `openQuestion` with its toolCallId.
  - `POST /api/chat` with `{chatId, input: {type: "answer", toolCallId, answer: {...}}}` (Origin set to the page's origin): HTTP 200, `turn-settled`.
  - `lh answer` returned one answer item: `{type: "answer", id, toolCallId, kind: "quiz", question, answers: [{index: 1, label: "P(A)"}], dontKnow: false, thinking, confidence: 80, correct: true}`, `openQuestion: null`. These are ticket 07's fields. `readingThinking` is left out because the answer had none.
  - `lh ask`, then `POST /api/chats/<id>/dismiss` with `{input: {type: "dismiss", toolCallId, answer: <dismissedAnswer("ask", ...)>}}`: HTTP 200 `{ok: true}`. `lh answer` returned `{type: "skip", id, toolCallId, kind: "ask"}`.
  - `lh say` to read past the skip; `lh answer` then returned `items: []`. `lh answer --wait --timeout 3` printed `{"ok":false,"error":"timeout"}` and exited 2, after 3.26 s.
  - Extra checks: `lh recall` in the probe phase was ok. `lh ask` while the recall was open was refused with `open_question` (exit 1). A GET with an `Origin` header got 403 `forbidden_origin`, and one with `Host: example.com` got 403 `forbidden_host`.
  - `next dev` rewrote AGENTS.md's first heading. That edit was reverted and is not part of this ticket.
- Blast radius: skipped, Risk: pre-release. Review: skipped under the small-diff rule (0 changed lines outside `.scratch/`).
