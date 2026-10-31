# 05: Verify phase A

Status: claimed
Blocked by: 01, 02, 03, 04
Risk: pre-release
Gate: none
Host: linuxdev
Touches: unknown

Phase A verification.

**What to build:** Run the phase check.

- [ ] The repo check passes (`docs/agents/check.md`), with no failures outside the baseline.
- [ ] Smoke run against a dev server listening on 127.0.0.1, with `LH_DATA_DIR` set to a temp directory and no API keys:
  - `lh lesson new` twice with one key returns the same id;
  - `lh say`;
  - a typed message posted through `POST /api/chat` is saved;
  - `lh answer` returns that message;
  - `lh show` returns the lesson.
