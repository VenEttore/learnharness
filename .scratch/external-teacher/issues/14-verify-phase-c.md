# 14: Verify phase C

Status: resolved
Blocked by: 10, 11, 12, 13
Risk: pre-release
Gate: none
Host: linuxdev
Touches: .scratch/external-teacher/phase-c-smoke.sh, .scratch/external-teacher/phase-c-smoke.log, this ticket

Phase C verification.

**What to build:** Run the phase check.

- [x] The repo check passes, with no failures outside the baseline.
- [x] Start a dev server with the guide's exact command and `LH_DATA_DIR` set to a temp directory. Confirm the port is not reachable on a non-loopback address.
- [x] A scripted no-key lesson runs through `lh` using the guide's JSON examples as written: probe, probe-done, plan, quiz, then an answer through `POST /api/chat`, then `lh answer`, then `lh show`.
- [x] Every `lh` command in the guide exists and behaves as the guide says.

## Comments

### Shipped 2026-10-31
Completed:
- `.scratch/external-teacher/phase-c-smoke.sh`: starts LearnHarness with the start lines from guide section 1 step 4 (fresh temp `LH_DATA_DIR` and log, port 3000, `LH_URL` set), waits on `lh show no-such-lesson`, then teaches a no-key lesson through `lh` using the guide's JSON examples as written. The learner's input goes through the page's routes. It stops only the process tree it started.
- `.scratch/external-teacher/phase-c-smoke.log`: the transcript, 78 checks, PASS. Force-added, because `.gitignore` ignores `*.log`.
- Loopback: only `127.0.0.1:3000` listens. A connection to `192.168.50.224:3000` is refused (curl exit 7). A forged `Host` is refused as `forbidden_host`, and a browser `Origin` as `forbidden_origin`.
- Lesson: create (and a rerun returns `existing:true`), the chat file exists, `/chat/<id>` returns 200. Then ask, page answer, `lh answer` (run twice, same items; also `--wait --timeout 5`), say, a repeat say, probe, page answer, say, recall (`--file`), page answer, say, probe-done, phase `plan`, say, plan, ask, page answer, quiz, phase `teach`, page answer through `POST /api/chat`, `lh answer`, say, a quiz repeat, explain, skip through the dismiss route, a resend that counts as a repeat, explain again, page answer plus a typed message, `lh answer`, a closing say, and `lh show` (phase, plan, no open question, no unread items, cursor).
- Every `lh` command and flag in the guide ran: lesson new (`--title`, `--key`, `--prompt`), say, ask, probe, recall, probe-done, plan, quiz, explain, answer (`--wait`, `--timeout`), show, `--after`, `--file`, stdin heredocs. `lh` also runs through a symlink (step 3). Exit codes 0, 1, 2 (`{"ok":false,"error":"timeout"}`) and 3 (`unreachable`, "is not reachable", `guide`) match section 2. Refusals that match section 5: `not_found`, `key_required`, `usage` (unknown flag, missing `--after`, bad JSON, `--timeout` without `--wait`, unknown command), `unread_input` (lesson id as `--after` on a prompt lesson, and an old cursor), `open_question`, `bad_after`, `wrong_phase` with `phase` and `allowed`, `invalid` (probe-done with `text`, a cyclic plan, a quiz before any plan whose problems name plan_init, a quiz on an unknown node), `not_bot_run`, `bad_reply`. An empty lesson's cursor is its id, and a turn with that cursor lands.
- The server log shows no model turn and no error.
Deferred: nothing. The smoke found no bug in merged code and no mismatch in the guide.
Verified:
- `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`: typecheck and lint pass. 3086 tests, 3085 pass, 1 fail. The failure is the baseline Pi main-loader test.
- `bash .scratch/external-teacher/phase-c-smoke.sh 3000`: PASS (78 ok, 0 FAIL). The first run passed 77 checks. The run was repeated after adding the symlink check, so the committed log comes from the committed script.
- Review skipped under the small-diff rule: every change is under `.scratch/`, 0 lines outside tests and `.scratch/`, no interface change.
- Blast radius skipped: Risk is pre-release.
