# 18: Tests for untested lh paths

Status: resolved
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: new test files

From the final spec review (item 3, Matt approved 2026-11-01). Ticket 13's reviewers checked these by hand; none has an automated test.

**What to build:** Automated tests, in a new test file, for:

- [x] `bad_reply`: the server on LH_URL answers with something other than JSON (an HTML error page or another program on the port); `lh` prints the bad_reply refusal and the exit code the guide gives.
- [x] Exit 3, "did not answer": LearnHarness is unreachable or does not answer; the reply and exit code match the guide.
- [x] A failed save on `lh lesson new`: the reply the guide describes, and a rerun with the same key behaves as the guide says.
- [x] `unread_input` when `--after` is newer than the bot's last turn: the refusal's items start after `--after` (and `bad_after` items start after the last turn), as the guide says.

If a test shows the code and the guide disagree, a small fix to either is fine; say which in Comments.

## Comments

### Shipped 2026-11-01
Completed:
- tests/lh-edge-paths.test.ts, a new file. lh runs as a child process. The last two cases go through the real external route handlers behind a plain HTTP server, with a temp LH_DATA_DIR.
- bad_reply: an HTML 500 page and a 200 HTML reply both print `{"ok":false,"code":"bad_reply","status":...,"error":<first 500 chars>}` and exit 1.
- Did not answer: a server that takes the request and never replies gives `unreachable`, "did not answer within 30 s", the URL, LH_URL and the guide, with exit 3 after at least 29 s. The test takes about 30 s because the 30 s limit is hard-coded in lh. No test knob was added.
- Failed save on `lh lesson new`: a read-only chats directory (chmod 555) makes the temp-file write fail. No production seam was needed. lh prints `{"ok":false,"code":"save_failed"}` with no cursor, exits 1, and leaves no file or temp file behind. Rerunning with the same key creates the lesson (`existing:false`, with the prompt in items, and the lesson file exists). A third run returns it with `existing:true`. Only one lesson holds the key. The test is skipped as root, because root ignores the mode bits.
- unread_input: with `--after` newer than the bot's last turn, the items start after `--after`. With `--after` at the last turn, they start after the turn. bad_after items start after the last turn. Each refusal's cursor is the newest message, nothing is saved, and the turn goes through with that cursor.
Code and guide: no disagreement found, so no change to either.
Deferred: none.
Verified: three mutations (the unread_input items ignoring --after, bad_reply not truncating, a create's save_failed carrying a cursor) each turned their test red, and reverting them restored the code. The full check (typecheck, lint, all tests with --test-concurrency=2) ran with 3089 passing and 3 failing. One failure is the baseline Pi main-loader test. The other two, custom-provider-restart and job-delivery-recovery, passed on a rerun (26/26) and failed under host load (1-minute load above 20). The integration tip f8aed07 was merged with nothing new. Blast radius skipped: Risk pre-release. Reviews skipped under the small-diff rule: 0 changed lines outside tests and .scratch, and no interface change.
