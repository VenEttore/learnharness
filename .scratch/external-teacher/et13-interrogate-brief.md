Break this change. Check out the SHA in your own worktree first: `git fetch origin && git checkout --detach 045695b7365fc469e786e56193996ef7586dfb0d`. Run `npm ci` if node_modules is missing (Node 22 is in ~/.local/bin; host is shared, 4 cores / 10 GB: never pkill/killall node or next; stop only processes you start). Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. Keep repros, and every file, link, or branch you create, inside your worktree. Leave them uncommitted. Push nothing. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result. Do not spawn agents.

Scope: `git diff feat/external-teacher...045695b` (the integration branch is feat/external-teacher, local in the repo; if your worktree lacks it, diff against d45c08d). One new file: docs/external-teacher.md.

Intent: docs/external-teacher.md lets a Grok Bot (the Bot Teacher) on a shared cloud computer start LearnHarness bound to 127.0.0.1 and run a full bot-run lesson (probe, plan, teach) with the `lh` CLI (scripts/lh.mjs, talking to src/server/bot-run.ts via the API routes), without reading LearnHarness's code. Every command, flag, exit code, refusal code and field, and JSON example must match the code. Ticket 14 runs every JSON example in the guide as-is, in order, against a real server, so the best way to break this guide is to start a server (`LH_DATA_DIR=<tmp dir in your worktree> npx next dev -H 127.0.0.1 -p <a free port 3100-3999>`, `LH_URL=http://127.0.0.1:<port>`) and follow the guide literally, then compare each reply and refusal to what the guide says. `next dev` rewrites AGENTS.md's first heading; leave it uncommitted. Stop your server when done. Also check: every LearnHarness tool name in the Method section's table exists in src/agent/tools or the prompt files; every prompt file path exists.

Settled decisions (do not relitigate; test whether the guide carries them out):
- The guide is docs/external-teacher.md, written for a Grok Bot. Keep it short; GLOSSARY.md terms.
- Command contract: lesson new, say, ask, probe, recall, answer [--wait] [--timeout], show, probe-done, plan, quiz, explain.
- No duplicate-id refusal for a plan; Mermaid merges repeated ids; a cycle is the only plan-tree error a bot reaches.
- With no plan yet, the quiz/explain refusal says "call plan_init"; the guide tells the bot that means `lh plan`.
- The quiz/explain node check reads the latest successful plan in the transcript (what the page draws and `lh show` returns).
- A retried quiz/explain whose node a later plan rewrite dropped returns repeat: true.
- Every reply carries the cursor; a new empty lesson's cursor is the lesson id; turn commands require --after; refusals are one JSON line with exit 1; --wait takes no value, polls every 2 s, 600 s default, timeout prints {"ok":false,"error":"timeout"} and exits 2; exit 3 = unreachable.
- Start LearnHarness bound to 127.0.0.1; LH_URL defaults to http://127.0.0.1:3000; after a lost `say` reply run `lh show` before resending, and a resend with the same --after returns repeat:true.
- Method section names LearnHarness's prompt files, maps tool names to lh commands, lists tools lh lacks (research, demos, visuals, pdf, find, ls, grep, read, list_sessions, list_propositions).
- Docs-only: do not report code bugs as guide findings unless the guide states the wrong behavior; you may list real code bugs separately as "code bug (not guide)".

Hardware: none.

Round context (round 3): round 1 ran the whole guide at 717c40e against a real server and found nothing. Round 2 reviewed 1766e6e; one seat stopped partway. Since 1766e6e, `git diff 1766e6e..045695b -- docs/external-teacher.md` changed: the exit 3 row (a "did not answer" after `lh lesson new` means rerun with the same `--key`; after `show`/`answer`, rerun), where `items` start in an `unread_input` refusal (after your `--after` when that message is newer than your last turn), `probe-done` refuses `text`, the server-ownership check in step 5, and "Resuming a lesson". Test those claims hardest, but the whole guide is in scope.

Server tips: if `next dev` is slow, `npm run build` then `LH_DATA_DIR=<tmp> npx next start -H 127.0.0.1 -p <port>` is fine. The host is shared and was at load 50 last round: run at most one server, and stop it when done.
