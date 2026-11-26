# Upstream 0.7.0 survey

Ticket 34. Survey run 2026-11-26. Branch `external-teacher-34-upstream-0-7-0-survey`, cut from 15d40910.

## Summary

- Upstream is 389 commits past v0.4.1, the release the fork last merged. v0.7.0 is 386 of them. Three newer commits follow it.
- The fork changed 22 files that upstream also changed. Ticket 27 had two conflicts. The trial merge today has 10 conflicted files and 21 conflict hunks. A hunk is one block of conflicting lines.
- Two upstream changes would break bot-run lessons if the merge resolves them carelessly. Side questions call a model. The page's send and auto-wake paths assume a model turn.
- My recommendation is to merge in steps by release, with a bot-run bench after each step. The decisions are at the end.

## Terms used here

- Bot-run lesson means a lesson an outside bot teaches through the fork's HTTP API. LearnHarness's own model never runs for it.
- ADR 0001 is the decision record that says bot-run lessons write native chat records and skip LearnHarness's model. File: `docs/adr/0001-bot-run-lessons-write-native-records.md`.
- Feat tip is `feat/external-teacher`. The trial used 58109392. That commit only changes `.scratch/external-teacher/STATE.md`, so its code matches 15d40910.
- Trial merge is `git merge --no-commit upstream/main` run in a scratch copy. Nothing was committed.
- Side question is a side conversation on tutor text. A model answers it in a floating companion.
- Chat record version is the number stamped on each saved chat. Upstream moved it from 1 to 2.
- Audit lock is a queue that lets one graph merge run at a time. The fork's findings route and the extraction pipeline share it.
- In-place fallback is a Windows save path that overwrites the file directly when the safe rename is blocked. A cut-off write can leave a partial file.
- Auto-wake is the page sending "continue" to the model when a turn is owed. The fork's gate is `continueIfOwed` in `components/session-core.ts`.
- Findings route is `POST /api/external/chats/:id/findings`. The bot sends graph findings there.
- `lh` is the fork's command-line client for bot lessons. Source: `scripts/lh.mjs`.
- Pi is the library LearnHarness uses to call models. Its packages are in `package.json`.

## What changed upstream

Non-merge commit counts by range: 52 from 0.4.1 to 0.5.0, 124 from 0.5.0 to 0.6.0, 27 from 0.6.0 to 0.6.1, 84 from 0.6.1 to 0.7.0, and 3 after 0.7.0. Upstream has no CHANGELOG.md. Tag messages are one line each, so the commit subjects serve as release notes. Short SHAs are given.

### Lesson flow and chat page

- Side questions can be asked from tutor text or with /btw. A foreground side agent answers them, and they stay in a floating companion. A model call is made for each one. Release 0.6.0. Commits 77a41e48, 23f05255, 58aade5b.
- Tutor text can be quoted and cited into the composer, with a selection toolbar. Release 0.6.0. Commits ac2e628a, d2de2911, 43258a74.
- Learner images can be attached, shown and annotated. Release 0.5.0. Commits d2ba3941, 4b01ec60, f6280401.
- Appearance now has a system mode, a light palette and more themes. Release 0.6.0. Commits 1efde05a, 9da3deab, 356029a8, b7b3f255.
- The transcript width is a setting, and questions lay out adaptively. Release 0.7.0. Commit a1442fe5.
- Quiz options get letters, and old letters stay visible. Release 0.7.0. Commits c3ff55ff, 7fa9e1fc.
- Compaction saves its summary on the current chat and places its marker correctly. Release 0.6.1. Commits ca0ac24c, e3618cbb.
- Desktop startup announcements. Release 0.7.0. Commit 7f8ac6b3.

### Teacher prompts and extraction

- Probing and questions changed. Probing can now change the teaching plan, in commit c4f5a09f. Probing no longer depends on the quiz mechanic, in commit ca196470. Wait instructions were removed from blocking question tools, in commit d2214b4c. Confidence is read across answer modes, in commit 0a8c0445. Changed prompt files include `src/agent/prompts/prober/10-probe-doctrine.md`, `src/agent/prompts/teacher/*.md` and `src/agent/prompts/shared/20-question-tools.md`. Release 0.7.0.
- Extraction no longer uses a global extract slot. Extraction requests share worker admission in `src/agent/worker-request-admission.ts`. Audits still wait in line. The upstream diff of `src/agent/subagents/extraction.ts` is 14 lines added and 37 removed. I did not trace a single commit for it.
- The Anthropic API path guards against swallowed teaching prose. Release 0.5.0. Commit e6cbc3eb.
- Plugins can grade question submissions and define practice problems. Release 0.6.0. Commits 1ce03872, 4b3d3981.

### Knowledge graph

- Node cards render math, and the chains view shows proposition statements. Release 0.6.1. Commits 91838774, 72f536ce.
- The sources map is read once per snapshot. Release 0.6.1. Commit 0c77ecff. The fork does not edit `src/core/graph.ts`.
- Session folders are shared in the sidebar, and deleting a folder deletes its sessions. Release 0.7.0. Commits 76f04ab3, 0f6c47d0.
- `src/core/contracts/graph.ts` changed by 41 lines added and 62 removed. The trial merged it without conflict. I did not check it line by line.

### Question card and question kinds

- `questionDisplayOptions` in `src/core/question-core.ts:638` is a new shared function. It shuffles quiz options by call id and returns a letter map, `optionOrder`, for single-select questions. The dock and the side-chat snapshot use it.

### Settings and model providers

- Search providers: Exa and Firecrawl, then a five-engine expansion with hosted Ollama. Release 0.5.0. Commits 0a587501, 309108c2, 146680b8.
- The tutor's file access is limited to chosen folders. Release 0.5.0. Commits 62828c78, c73a251d.
- Manual model catalog refresh, nested token limits, and the llama.cpp context window. Releases 0.7.0 and 0.6.1. Commits 1cfb7ea2, 90535c9c, a189e609.
- Settings has a prompt editor for each segment. Release 0.7.0. Commit 53f92387.
- Claude Code offers Fable in the model list. Release 0.7.0. Commit 39babf15. The Claude CLI now retries a dropped stream. Commit e3cfff6e, after 0.7.0.
- ChatGPT model discovery retries transient failures. Commit 8b38deb5, after 0.7.0.

### Desktop app

- Only web and mail links open outside the app. Release 0.6.0. Commit ff805a3c.
- The window chrome follows the appearance mode. Release 0.6.0. Commit 7655817d.
- Desktop dev waits for the server before it opens Electron. Release 0.6.0. Commit 1d0b489d.
- Update-install IPC and the CLI environment are tightened. Release 0.7.0. Commit d3b5ddb9.
- `electron/` has 7 changed files. I did not read them.

### Build and dependencies

- Pi libraries go from 1.4.0 to 1.5.2 in `package.json`. Release 0.7.0. Commit 9cf2a2f0.
- Next.js goes from 16.4.3 to 16.4.6. Release 0.7.0. Commit fcad626f. Fork ticket 33 covers the same bump, and it is still open.
- Dependencies added: aria-hidden, Radix popper, focus-scope and presence, react-remove-scroll, and undici. Dependencies removed: ansi-to-react and react-jsx-parser.
- `npm run dev` and `npm run build` now build the core plugins and the plugin authoring files first. `dev` and `start` pass `-H localhost`. Source: the `scripts` block in `package.json`.
- Core plugins ship separately from community installs. Release 0.6.0. Commit 86ff6396.
- Every store adapter uses crash-safe writes. `src/store/atomic-write.ts` is new. The series runs from b018c71c to c0256a92, which covers chats. Release 0.5.0.
- Chat record version 2. Commit 58aade5b. Source: `src/core/contracts/chat.ts:57`.
- Security: five reviewed advisory fixes. Release 0.6.0. Commit d05b79e5. Production npm audit advisories cleared. Release 0.7.0. Commit 6badc17f.

### Docs

- Docs were reorganized and historical plans archived. Release 0.5.0. Commit f68bae23.
- AGENTS.md changes one line: the Next.js block heading becomes level two. The trial merged it cleanly.

## Overlap with the fork

The fork's own changes from v0.4.1 are 156 files, with 15,268 lines added and 163 removed. Of these, 131 files are new. The fork edits 25 existing upstream files, and 22 of them also changed upstream. No file the fork added has the same path as an upstream change.

Line counts below come from `git diff --numstat` against v0.4.1. Upstream is the merge target, and the fork is the feat tip.

| File | Upstream +/- | Fork +/- | Trial result |
|---|---|---|---|
| app/api/chats/[id]/dismiss/route.ts | 32/15 | 10/2 | conflict, 1 hunk |
| components/chat.tsx | 804/224 | 21/14 | conflict, 6 hunks |
| components/extraction-coverage.tsx | 6/2 | 4/1 | merged |
| components/graph-view.tsx | 149/99 | 21/9 | merged |
| components/question-dock.tsx | 569/287 | 4/51 | conflict, 2 hunks |
| components/session-core.ts | 382/78 | 6/1 | conflict, 2 hunks |
| components/session.ts | 20/3 | 4/2 | merged |
| docs/architecture.md | 117/152 | 2/0 | conflict, 1 hunk |
| src/agent/subagents/extraction.ts | 14/37 | 19/10 | conflict, 1 hunk |
| src/agent/tools.ts | 12/10 | 5/13 | merged |
| src/agent/tools/plan.ts | 1/1 | 6/34 | merged |
| src/agent/tools/probe.ts | 8/7 | 4/8 | merged |
| src/core/contracts/chat.ts | 134/83 | 25/0 | conflict, 3 hunks |
| src/core/contracts/graph.ts | 41/62 | 10/0 | merged |
| src/core/index.ts | 24/1 | 4/0 | merged |
| src/core/input-events.ts | 140/21 | 3/2 | conflict, 1 hunk |
| src/core/ports.ts | 53/0 | 4/2 | merged |
| src/server/chat-handler.ts | 357/48 | 4/0 | conflict, 2 hunks |
| src/server/index.ts | 12/0 | 3/0 | merged |
| src/store/chats.ts | 48/8 | 26/6 | conflict, 2 hunks |
| AGENTS.md | 1/1 | 7/3 | merged |
| README.md | 14/9 | 24/0 | merged |

The fork's most important edit is small in one place. `src/server/chat-handler.ts` has 4 fork lines, and upstream rewrote 357 lines in the same file.

### What bot-run lessons rely on

- Turn records under ADR 0001. The fork stamps `driver` and `externalKey` on the record and the summary in `src/core/contracts/chat.ts`, on the fork side of conflict 7. Upstream adds fields to the same types. Both must survive the merge.
- The bot-run early return. `src/server/chat-handler.ts:206` on the fork returns `handleBotRunInput` before any turn. The fork's return must stay ahead of upstream's new checks.
- Question kinds and displayed options. The fork's `displayedQuestionOptions` is in `src/core/question-card.ts:30`. The fork's `questionDataOf` in `src/core/answer-submit.ts:30` uses it, and a fork comment in `components/question-dock.tsx` says `lh submit` shares that builder. Upstream's `questionDisplayOptions` in `src/core/question-core.ts:638` is a second implementation.
- Extraction names. `EXTRACTOR_INSTRUCTIONS` is at `src/agent/subagents/extraction.ts:437`, `sessionFindingsSchema` at `:224`, and `mergeFindings` at `src/core/graph.ts:149`. The upstream diff does not change those three names. The lock and slot code around them does change.
- Graph ledgers and `graphDataRevision`. `graphDataRevision` is at `src/server/graph-findings.ts:339`. The graph route and the status route use it at `app/api/graph/route.ts:14` and `app/api/graph/status/route.ts:37`. Upstream does not change those three fork files. The graph contract keeps the fork's `source` field, which the trial merged at `src/core/contracts/graph.ts` lines 53 and 143 of the merged file.
- The lesson page's auto-wake. `components/session-core.ts:961` on the fork skips automatic continuation when `this.botRun` is set. Conflict 4 decides whether that gate survives.
- The findings route's audit lock. `src/server/graph-findings.ts:190` on the fork is a try-lock that returns "busy". It shares `globalThis.__lhAuditLock` with the FIFO queue at `src/agent/subagents/extraction.ts:896`. Upstream changes the release line of that queue. See conflict 6.
- Upstream side questions have no bot-run guard. Route `app/api/chats/[id]/side-chats/route.ts:34` calls `sideChats.ask`. That runs `src/server/side-chat.ts:120`, and `streamSideAnswer` answers at `:199`. Upstream code has no driver check on that path. The fork has no side-chat route, and its only bot-run guard is `chat-handler.ts:206`.

## Trial merge conflicts

The trial ran `git merge --no-commit --no-ff upstream/main` in a detached scratch worktree at feat/external-teacher, 58109392. The merge exited 1 with 10 conflicted files and 21 hunks. The other changed files merged without markers. The trial was then aborted with `git merge --abort`. The worktree was removed with `git worktree remove --force`, and `git worktree list` no longer shows it.

Skipped in the trial: `npm ci`, typecheck, lint, tests and build. Auto-merged files may still fail to compile.

1. `app/api/chats/[id]/dismiss/route.ts`, 1 hunk. Upstream runs a plugin-question check before the chat lookup. The fork keeps a plain 404 check. Keep both.
2. `components/chat.tsx`, 6 hunks. The hook call, the plan memo, the busy flag, the send path, the steer-or-send path and the abort dialog all changed on both sides. The busy flag and the send path decide what a bot-run page does.
3. `components/question-dock.tsx`, 2 hunks. Imports, and the quiz builder. The fork builds the question with `questionDataOf`, which `lh submit` shares. Upstream builds it inline with `questionDisplayOptions` and an `optionOrder` map. One builder has to win.
4. `components/session-core.ts`, 2 hunks. The constructor, and the auto-wake gate. The fork's gate skips automatic continuation for bot-run lessons. Keep it.
5. `docs/architecture.md`, 1 hunk. The fork's text on folder imports and the findings route sits in the block that upstream rewrote as a storage table. Docs only.
6. `src/agent/subagents/extraction.ts`, 1 hunk. The audit-lock release in the `finally` block. The fork releases its own link when it holds the lock, and otherwise waits for the predecessor. Upstream always waits for the predecessor. I infer the two are equivalent, because chain links only resolve and never reject. Ticket 29's abort-while-waiting test should confirm it.
7. `src/core/contracts/chat.ts`, 3 hunks. The fork adds `driver`, `externalKey` and `ChatDriverInit` to the record and the summary. Upstream rewrites comments and adds fields. Keep the fork fields and upstream's comments.
8. `src/core/input-events.ts`, 1 hunk. Imports only. The fork imports `withAuthoredText`. Upstream imports plugin-question types and adds three input types. Keep both.
9. `src/server/chat-handler.ts`, 2 hunks. Imports, and the bot-run early return. The fork returns before any turn. Upstream adds plugin checks and host lookups in the same spot. The fork's return should stay first.
10. `src/store/chats.ts`, 2 hunks. Imports, and `writeChat`. The fork writes a temp file and renames it, as ticket 16 asks. Upstream calls the shared atomic writer with the in-place fallback on. See D2.

## Risks

R1. High. A side question can reach a model in a bot-run lesson after a plain merge. I infer this from reading the routes and the service. I did not run it. The fix is a refusal on the side-chat routes for lessons with `driver` set to external. Bench check 2 tests it.

R2. High. The page's send path and auto-wake. The fork skips the model-picker check for bot-run lessons at `components/chat.tsx:1230`. The upstream side of conflict 2 has no such check in that spot, so the check may move or disappear. I infer this from the conflict text. If auto-wake follows upstream, a bot-run page may ask for a model continuation. I did not read the body of `handleBotRunInput` in `src/server/bot-run.ts:77`, so I do not know whether the server refuses a `continue` input. Bench checks 3 and 4 test these.

R3. High. Quiz option order and answer parity. A fork comment says an answer saved by `lh submit` is the page's record, so both paths must save the same record. Upstream adds `optionOrder` through its own function. Both functions seed the shuffle with the call id, so the order may match. I infer that from the code and did not run it. The letter map exists only on upstream's side. Bench check 5 compares a page answer with an `lh submit` answer.

R4. Medium. Chat record version 2 is a one-way step for practical rollback. Upstream stamps version 2 from commit 58aade5b on, and it refuses to read records stamped newer than its build. The fork's constant is 1, and its comment in `src/store/chats.ts` says it refuses newer versions too. So a pre-merge build cannot read a version 2 chat. Back up the data folder before the first merged run.

R5. Medium, Windows only. The in-place fallback, see D2. Upstream's `writeChat` passes `allowInPlaceFallback: true` at line 60 of its `src/store/chats.ts`. Upstream's `src/store/atomic-write.ts` header says the fallback saves in place when another program holds the file for about 100 ms. A cut-off write can then leave a partial chat. The fork's ticket 16 promised a whole file. Bench check 7 tests this.

R6. Medium. Host binding. `npm run dev` and `npm run start` now bind `-H localhost`. The fork's `lh` client defaults to `http://127.0.0.1:3000`, set at `scripts/lh.mjs:56`, and the smoke scripts use 127.0.0.1. I infer that binding `localhost` can listen on IPv6 only on some hosts. I did not check that on linuxdev. `scripts/dev-fresh.sh` runs `npm run dev`, so it also runs the plugin builds first.

R7. Medium. Pi 1.5.2 and Next.js 16.4.6 arrive together. The Pi bump touches the model library that LearnHarness's own lessons use. Ticket 33 is open at 15d40910, and its branch is not an ancestor of feat/external-teacher. `package-lock.json` changed upstream and merged cleanly, but the trial did not run `npm ci`.

R8. Medium. Audit lock and extraction. Upstream removed the global extract slot. More extraction work now runs at once, while audits still serialize. The fork's findings route and the extraction queue share one lock. Conflict 6 changes the queue's release. Bench check 6 tests a findings POST during an extraction run.

R9. Medium. Auto-merged files that both sides changed. In `src/agent/tools/plan.ts`, the fork imports plan_init's schema and result from `src/core/teaching-tool-results.ts` and removes 34 lines. Upstream changed one line there, and moved plan layout into `plan-layout.ts` in commit 25922a5a. In `src/core/contracts/graph.ts`, upstream removed 62 lines. Only a typecheck can show whether these compile.

R10. Medium. Test baseline. Upstream changed 325 test files. Ticket 27 found one fork baseline failure, the Pi loader test. Run the check on upstream/main alone so that upstream failures are not blamed on the fork. Not run here.

R11. Low. AGENTS.md. Upstream changes the Next.js block heading. The fork's rule keeps the fork section below that block. The change merged cleanly. A `next dev` run rewrites the block, so check the diff after the first run.

## Recommendation

Merge in steps by release tag. One merge to upstream/main is possible, but it covers 389 commits and 10 conflicted files. Side questions arrive in 0.6.0, and they need their own bench.

1. v0.5.0. 81 commits from the base, counting merges. Store write series, search providers, file access and learner images. Expect `chats.ts` and the `chat-handler.ts` imports to conflict again. Bench checks 1, 6, 7 and 8.
2. v0.6.1, which includes 0.6.0. Side questions, citations, appearance and plugin questions. R1's side-chat guard must land in this step, before this step's bench. Expect `chat.tsx`, `session-core.ts`, `chat-handler.ts` and `question-dock.tsx` to conflict. Run every bench check.
3. v0.7.0. Pi 1.5.2, Next.js 16.4.6, with ticket 33 folded in per D3, question letters, prompts and the sidebar. Bench checks 5 and 8, plus `npm ci` on a clean clone and a dev start.
4. The three commits after v0.7.0: 069a6a11, 8b38deb5 and e3cfff6e. They are small and touch Claude Code and ChatGPT discovery. Run the smoke checks only.

Each step is a merge commit, not a squash or a rebase, as in ticket 27. Stepping costs more conflict work. Expect the same chat and session files to conflict in steps 2 and 3. I infer this from the overlap table. The gain is that a model-call regression shows up in one bench, not four.

Bench checks after each step:

1. Send a turn to a bot-run lesson. The server log shows no model turn and no error. The fork's phase-c smoke checks this. The script is `.scratch/external-teacher/phase-c-smoke.sh`.
2. Ask a side question on a bot-run lesson. It is refused, and no model call is made.
3. Owe a continuation on a bot-run lesson. No `continue` turn is sent.
4. Send page text in a bot-run lesson with no model configured. It saves and reaches the bot route.
5. Answer one quiz on the page and one with `lh submit`. The option order, the answer key and `optionOrder` match in both saved records.
6. POST findings while an extraction runs. The result is busy or accepted, and no merge is lost. Chains are still refused with `chains_not_accepted`, set at `src/server/graph-findings.ts:106`.
7. Save a chat while another program holds the file open on Windows. The result matches the option chosen for D2. The old file stays whole.
8. Run the card-22 check in `.scratch/external-teacher/card-22/` and the full test run on a clean clone. Run the same tests on upstream/main alone for the baseline.
9. Run `npm run dev`, then `curl http://127.0.0.1:3000` and the `lh` default URL.

Before the first merged run, back up the data folder. See R4.

## Decisions for Matt

D1. Merge shape. Options: (a) one merge to upstream/main; (b) steps by release, 0.5.0, then 0.6.1, then 0.7.0, then the three later commits. My pick: (b). Side questions arrive in 0.6.0, and a bench after each step shows which release broke a bot-run guard.

D2. Chat saves on Windows when another program holds the file open. Options: (a) keep upstream's in-place fallback, so saves always succeed, but a cut-off write can leave a partial chat; (b) turn the fallback off for chat saves, so a blocked save fails with an error and the old file stays whole. My pick: (b). Ticket 16 promised whole files, and bot-run lessons depend on that promise.

D3. Ticket 33, the Next.js 16.4.6 bump. Options: (a) ship ticket 33 first, then merge; (b) let the 0.7.0 step bring 16.4.6, and close ticket 33 as folded in. My pick: (b), so Next.js moves once.

D4. Quiz option order. Options: (a) make the `lh submit` builder, `questionDataOf`, call upstream's `questionDisplayOptions`, so both paths share one function; (b) keep the fork's `displayedQuestionOptions` and add upstream's letter map to it. My pick: (a).

D5. Side questions in bot-run lessons. Options: (a) refuse them for lessons whose driver is external, as ADR 0001 implies, since LearnHarness never calls its model for those lessons; (b) allow them. My pick: (a). The bench confirms the refusal.

## Card

What is true
- Upstream is 389 commits past v0.4.1. The fork changed 22 of the same files.
- A trial merge today conflicts in 10 files across 21 hunks. The trial is aborted and its worktree removed. Nothing was committed or pushed from it.
- A plain merge would let a side question reach a model in a bot-run lesson. This is inferred from the code and not run.
- A merge brings chat record version 2. The pre-merge fork build cannot read those chats afterwards.
- Nothing was typechecked, linted, tested or built.

What to do next
- Matt: decide D1 to D5. My picks are listed with each item.
- Matt: back up the data folder before the first merged build runs.
- Next agent: once D1 is decided, start step 1, v0.5.0, on its own ticket.
- Ticket 34 is resolved and its branch is pushed. Nothing merges into feat/external-teacher until you say "ship it".

What is open
- The `handleBotRunInput` body in `src/server/bot-run.ts:77` was not read. Whether the server refuses `continue` and side-question input is unknown.
- Pi 1.5.2's effect on the fork's lessons is unchecked.
- Upstream's 325 changed test files were not reviewed.
- Whether the audit-lock release change in conflict 6 is equivalent is an inference until ticket 29's test runs.
