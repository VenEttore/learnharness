# 05: Verify phase A

Status: resolved
Blocked by: 01, 02, 03, 04
Risk: pre-release
Gate: none
Host: linuxdev
Touches: unknown

Phase A verification.

**What to build:** Run the phase check.

- [x] The repo check passes (`docs/agents/check.md`), with no failures outside the baseline.
- [x] Smoke run against a dev server listening on 127.0.0.1, with `LH_DATA_DIR` set to a temp directory and no API keys:
  - `lh lesson new` twice with one key returns the same id;
  - `lh say`;
  - a typed message posted through `POST /api/chat` is saved;
  - `lh answer` returns that message;
  - `lh show` returns the lesson.

## Comments

### Shipped 2026-10-31
Completed: ran the phase A check (repo check and smoke run). No code changes were needed.
Deferred: none. Docs/external-teacher.md, the guide `lh` points to, is ticket 13.
Verified:
- Repo check (`npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx`): typecheck and lint clean; 3007 tests, 3006 pass, 1 fail. The one failure is the baseline Pi main-loader test.
- Smoke run: `next dev -H 127.0.0.1 -p 3517`, fresh temp `LH_DATA_DIR`, no API keys in the environment, `LH_URL=http://127.0.0.1:3517`.
  - `lh lesson new --title "Smoke lesson" --key smoke-k1 --prompt "Teach fractions"` twice: same id `chat_mvvtk74f_4f5dc97d` both times (`existing: false`, then `existing: true`).
  - `lh say` with stdin: ok, returned a new cursor.
  - `POST /api/chat` with `{chatId, input: {type: "text", text: "Is it 3/4?"}}`: HTTP 200, `turn-settled`; the message is in the chat JSON on disk.
  - `lh answer`: returned that message, with `openQuestion: null`.
  - `lh show`: returned the lesson (phase probe, all three messages in order).
  - An extra check: a GET with an `Origin` header was refused, 403 `forbidden_origin`.
- Blast radius: skipped, Risk: pre-release. Review: skipped under the small-diff rule (0 changed lines outside `.scratch/`).
