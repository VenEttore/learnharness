# 09: Verify phase B

Status: open
Blocked by: 06, 07, 08
Risk: pre-release
Gate: none
Host: laptop
Touches: unknown

Phase B verification.

**What to build:** Run the phase check.

- [ ] The repo check passes, with no failures outside the baseline.
- [ ] Smoke run against a dev server listening on 127.0.0.1, with no API keys:
  - `lh probe`, then an answer through `POST /api/chat`, then `lh answer` shows the full answer item;
  - `lh ask`, then a skip through the dismiss route, then `lh answer` shows the skip;
  - `lh answer --wait --timeout 3` with nothing new exits 2.
