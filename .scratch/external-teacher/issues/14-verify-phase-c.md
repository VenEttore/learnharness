# 14: Verify phase C

Status: open
Blocked by: 10, 11, 12, 13
Risk: pre-release
Gate: none
Host: laptop
Touches: unknown

Phase C verification.

**What to build:** Run the phase check.

- [ ] The repo check passes, with no failures outside the baseline.
- [ ] Start a dev server with the guide's exact command and `LH_DATA_DIR` set to a temp directory. Confirm the port is not reachable on a non-loopback address.
- [ ] A scripted no-key lesson runs through `lh` using the guide's JSON examples as written: probe, probe-done, plan, quiz, then an answer through `POST /api/chat`, then `lh answer`, then `lh show`.
- [ ] Every `lh` command in the guide exists and behaves as the guide says.
