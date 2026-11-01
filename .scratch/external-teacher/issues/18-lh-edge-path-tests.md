# 18: Tests for untested lh paths

Status: claimed
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: new test files

From the final spec review (item 3, Matt approved 2026-11-01). Ticket 13's reviewers checked these by hand; none has an automated test.

**What to build:** Automated tests, in a new test file, for:

- [ ] `bad_reply`: the server on LH_URL answers with something other than JSON (an HTML error page or another program on the port); `lh` prints the bad_reply refusal and the exit code the guide gives.
- [ ] Exit 3, "did not answer": LearnHarness is unreachable or does not answer; the reply and exit code match the guide.
- [ ] A failed save on `lh lesson new`: the reply the guide describes, and a rerun with the same key behaves as the guide says.
- [ ] `unread_input` when `--after` is newer than the bot's last turn: the refusal's items start after `--after` (and `bad_after` items start after the last turn), as the guide says.

If a test shows the code and the guide disagree, a small fix to either is fine; say which in Comments.
