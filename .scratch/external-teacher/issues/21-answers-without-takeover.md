# 21: Answers without a desktop takeover

Status: resolved
Blocked by: 20, 22
Risk: pre-release
Gate: none
Host: linuxdev
Touches: scripts/lh.mjs, docs/external-teacher.md, GLOSSARY.md if a term is added, new test files

From ticket 15's bench (P1, P2, P3). On the bench, Ven was on a phone. The lesson page can be reached that way (Take over of the bot's desktop from a phone), but driving a desktop VM through a phone is very inconvenient. The bot asked questions in Grok Bot chat widgets and hand-built `POST /api/chat` requests to save the answers into the lesson, so `lh answer` still saw them. That path is undocumented, and once the bot graded a pick before it had the confidence. The learner's standing preference: never reveal right or wrong until the confidence is in.

**What to build (recommended design; reopen only if the code makes it unworkable):**
- [x] A new `lh` command, e.g. `lh submit <lesson> --after <cursor>`, that saves a learner's answer exactly as the page does (same request shape to the existing page route, POST /api/chat, so the stored answer is identical to a page answer). It takes the pick(s) by index, confidence (the page's values: 0/30/50/70/90/100), optional thinking, "I don't know", and skip. For quiz and probe picks, confidence is required unless the answer is "I don't know"; a pick without it is refused before anything is sent. Read the page's answer and dismiss request shapes (tests/bot-run-answers.test.ts, tests/bot-run-page-input.test.ts, ticket 09/14 smoke scripts) and mirror them. No new server route unless the page route cannot be reused; say why if so.
- [x] Ticket 20 found the bench's LaTeX corruption came from the bot building the answer request inside a double-quoted shell string (bash expanded `$n`, `$k` to nothing). `lh submit` takes picks by index and never needs the question text; the guide tells the bot to pass any JSON that contains `$` through `--file` or a single-quoted heredoc, never a double-quoted string.
- [x] Retried `lh submit` is safe to run twice (no duplicate answer).
- [x] Guide: a section for a learner who answers outside the page (phone, chat widgets): ask in your own channel, collect pick + confidence (+ thinking) together, never say right or wrong before the confidence is in, save it with `lh submit`, then read it back with `lh answer`. Say that picks are read and sent by index, not label. Note that the learner can still reach the lesson page from a phone through Take over, but it is slow; the out-of-page path is the convenient one. Ven's intended flow (2026-11-01): the bot screenshots the question card page (`/chat/<id>/card`, ticket 22) and sends it, the learner answers in a chat widget, the bot saves it with `lh submit`.
- [x] Guide, from the Watcher's Grok Bot capability notes (2026-11-01): only the main Grok Bot chat agent can raise chat widgets, not its subagents or routine runs, so the Bot Teacher itself asks. Grok Bot chat does not treat a single `$` as math; when mirroring a question, teaching text or plan into chat, convert `$...$` to `\( ... \)` (display math `$$...$$` and fenced `mermaid` render as they are). The screenshot of the card shows math as the page renders it, so it needs no conversion.
- [x] Guide, Method section: update the "no equivalent" list with the Grok Bot tools that stand in for LearnHarness tools, per the Watcher-marked mapping in .scratch/external-teacher/grok-bot-tool-map.md: web search/fetch and subagents for `research`; mermaid in chat or an HTML/SVG screenshot for `visual` (generated images are illustrations, not exact diagrams); poppler-utils for `pdf`; shell on the box for `find`, `ls`, `grep`, `read` (copy the learner's notes to the box first); `demo` is screenshots plus a widget on a phone, interactive only through desktop Take over; subagents cannot raise widgets. Keep it short.
- [x] Guide: during the first compile the sidebar shows "Loading..."/"Compiling..." while the lesson works; do not restart the server for it.
- [x] If cheap: `lh` prints a clear error when Node is older than 22.
- [x] Tests for lh submit: one-shot pick + confidence + thinking stores the same record as the page; missing confidence refused; "I don't know" without confidence accepted; skip; retry is a repeat.
- [x] Update phase-c-smoke.sh to cover lh submit and rerun it.
- [x] Ticket 19's deferred wording (from its ship comment): guide :32 step 5 passes on a desktop-mode exit 1; guide :47 has no case for your server on another port while LH_URL points elsewhere; guide :143 does not mention open_question; spec.md:81 bot_run_lesson over HTTP; lh.mjs:17 and spec:136 "without ok:true" misses ok:true on non-2xx. Fix them while editing the guide.
- [x] From ticket 22: `lh submit` numbers options in the card's shown order (map through displayedQuestionOptions; `lh show` returns authored order). GLOSSARY entries for "question card" and "lead-in".
- [x] From bench 2 (2026-11-02, Ven's test bot): the guide says hand-built answer bodies must go through `--file`, a single-quoted heredoc or `curl --data-binary @file`, never a double-quoted string. Say why: bash expands `$name` and runs `$(...)` from lesson text while building the body (bench 2 N3). Bench 2 found these paths clean in every case. If ticket 20 ships with known limits, list them in the guide.
- [x] From bench 2: the API stores any confidence value as sent (null, 150, "high"), and `correct` is trusted from the client. Both predate this feature. `lh submit` enforces the page's values; note the server side as a known limit unless a guard is cheap.
- [x] `lh submit` refuses a null or out-of-range pick before sending (ticket 20 found upstream compactAnswerForModel crashes on a null pick entry).

## Comments

### Stopped at the review cap 2026-11-02 (3 of 3 rounds this launch; Status stays claimed)
Branch `external-teacher-21-answers-without-takeover`, tip 5639103. Rounds used on this ticket: 3 of 8.

Completed (every checklist box has code, guide text or a test; none is deferred):
- `lh submit <lesson> --after <cursor>` (`scripts/lh.mjs`) reads one JSON object from `--file` or stdin: `picks` (card numbers), `confidence`, `thinking`, `dontKnow`, `text`, `other`, or `{"skip":true}` alone. It reads the lesson with `lh show`'s route, checks the answer against the question open at `--after`, and saves it through the page's own routes, POST /api/chat for an answer and POST /api/chats/<id>/dismiss for a skip. No server route was added. The reply is `lh answer`'s reply after the save, plus `repeat` and `toolCallId`.
- The answer record comes from the dock's own code. The dock's QuestionData builder moved, unchanged, into `questionDataOf` in `src/core/answer-submit.ts` (new), and `components/question-dock.tsx` now calls it (a net 50-line deletion there; `src/core/index.ts` exports the file). `planSubmit` builds the dock's AnswerRequest and runs upstream `buildAnswer`, so grading, the option snapshot, the explanation and the commitment match the page.
- Card order: `questionDataOf` orders options with ticket 22's `displayedQuestionOptions`, the function the card and the dock use. lh.mjs is plain Node with no build step, so it loads `answer-submit.ts` through tsx's `tsImport` (tsx is a dev dependency `npm ci` installs). Without tsx, `lh submit` refuses with `usage` and an `npm ci` hint. Other commands still need nothing. A submit costs about 0.5 to 0.7 s more than `lh show` for the load.
- Refused before anything is sent: unknown fields, non-integer or null picks (`usage`); picks out of range or doubled, a quiz or probe pick without a confidence of 0/30/50/70/90/100, confidence or "I don't know" where the page has none, a single-select pick beside `other`, fields a typed-answer question does not take (`invalid`, with the card's numbered options). Also `unread_input`, `bad_after`, `no_open_question`, and `answered` (with the `saved` answer).
- Retries: the same submit again is `"repeat":true` and saves nothing, with the same `--after` or a later cursor, until the bot posts after the answer. After that, `no_open_question`. A page answer racing a submit leaves one answer: `repeat` if equal, `answered` if not.
- `lh` refuses with `node_version` on Node 16 to 21 (see open item 1 for older Node).
- Guide (`docs/external-teacher.md`): section 4 "Answers outside the page" (Take over is slow from a phone; card screenshot, widget from the main agent only, pick, confidence and "why" together, no right or wrong before the confidence, `lh submit`, grade from its reply, numbers not labels, `lh show` is authored order, field and refusal tables, retries, math in chat as `\( \)`, the never-double-quoted rule with ticket 20's limits A, B1 and the `$?`/`$$`/`$(...)` leftovers, and the server storing any confidence and trusting `correct`). Section 2: the double-quoted rule for all `lh` input. Section 6: the Grok Bot stand-in table. Section 1: the "Loading..."/"Compiling..." note and Node 22.
- Ticket 19's deferred wording: guide step 5 (exact not_found reply), the another-port case, plan resend vs `open_question`, spec.md bot_run_lesson over HTTP, and the exit-1 wording in lh.mjs and spec.md.
- GLOSSARY: "Lead-in", "Question card"; "Repeat" covers `lh submit`.
- Server-side limits (any confidence stored, `correct` from the client): left as known limits in the guide. A guard would change the upstream answer route for every lesson; `lh submit` is the supported path and sends only page values.
- `tests/lh-submit.test.ts` (new, 15 tests): real `lh` against the real routes, including a pick with confidence and thinking storing the page's record (options in the card's order), missing confidence refused, "I don't know" without one, skip, retry as repeat, stale cursors, the refused path and the page-first race.
- `phase-c-smoke.sh` section 9b covers `lh submit` against a real `next dev`, including the card page's number matching `lh`'s.

Open (round 3, interrogate seat A, reproduced with Node 12.22.12): on Node 12, `lh` fails to parse (`??`, top-level await) and prints a SyntaxError, not the `node_version` line guide :11 promises. Node 16 and 18 get the refusal. Fix one of two ways: a small entry file in old syntax that checks the version and then imports lh.mjs, or narrow guide :11 to "Node 16 to 21". Commit 5639103 (round 3 code-review's two fixes: the double-quoted rule now covers `lh` input; tests for `refused` and the race) has not been reviewed.

Verified:
- Full check at f022a43: typecheck and lint clean; 3163/3164, the one failure the baseline Pi main-loader test. Full check at 2e88d27 (5639103 plus this comment): typecheck and lint clean; 3166/3167, the one failure the same baseline test.
- `NODE_ENV=test npx tsx --test tests/lh-submit.test.ts`: 15/15 at 5639103.
- `bash .scratch/external-teacher/phase-c-smoke.sh 3731` at f022a43: PASS. Reviewers reran it: PASS (102 ok) at 334faaf and 5b76a9e.
- Review: 3 rounds of code-review (Opus 5.5 xhigh) and interrogate seats A (Opus 5.5 xhigh) and C (Haiku 5.5 xhigh). Seats B (GLM 5.3 Flash) and D (Composer 2.5) were skipped: Cursor usage limit until 2026-11-19 on their round-1 try. Round 3: code-review 2 findings (fixed in 5639103), seat C 0, seat A 1 (open above).
- Blast-radius skipped: Risk pre-release.

### Shipped 2026-11-02 (continued one round on Ven's Continue, via the Watcher)
Completed, in addition to the entry above:
- The Node 12 item, as decided: a guide change, no entry file. Guide :11 now says Node 14.13.1 to 21 get the `node_version` refusal and that older Node crashes before `lh` can check, printing no JSON line. The `lh.mjs` header says the same. Ven's "Node 14+" was not true for 14.8 to 14.13.0, so the guide names only versions that were run.
- Round 4 fixes:
  - The guide's first example and the input rule single-quote command-line text (`--title`, `--prompt`), with `'\''` for a quote inside. The smoke script's copy of that example does the same.
  - The barrel export of `answer-submit.ts` has its own fork marker.
  - The checks for "the question is closed" (stale cursor, already answered, unread input) now run before answer validation. A wrong answer sent with a stale cursor, or to a question already answered, gets `no_open_question` or `answered`, not an `invalid` that names the wrong question's options. Two cases were added to `tests/lh-submit.test.ts`.
  - Known limit, now in the guide's `unread_input` row: a message the learner types in the instant between `lh submit`'s read and its save is not caught. The answer is saved and the message comes back in the reply's `items`. Closing that window would change the page route's input, which the settled decisions rule out.

Deferred: none.

Verified:
- Node versions, from npm's `node-linux-x64@<version>` running `lh show x` against a closed port:
  - These print `{"ok":false,"code":"node_version",...}` and exit 1: 14.13.1, 14.17.6, 14.18.0, 14.21.3, 16.20.2, 18.20.8, 20.11.1. Reviewers added 15.0.0, 15.0.1, 15.1.0, 15.14.0, 16.0.0, 18.20.4, 20.18.1 and 21.7.3, all the same.
  - These crash, exit 1 and print nothing on stdout: 12.22.12 (and 13.14.0) with `SyntaxError: Unexpected token '?'`; 14.7.0 with `SyntaxError: Unexpected reserved word`; 14.8.0 and 14.13.0 with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
- Review round 4 (this launch's one round) at 1e0d65c:
  - Code-review (Opus 5.5 xhigh): Standards PASS with one judgement call (the fork marker), Spec FAIL on the `--prompt "..."` example. Both fixed.
  - Interrogate seat A (Opus 5.5 xhigh): 1 finding (validation before the closed-question checks), fixed.
  - Seat C (Haiku 5.5 xhigh): 1 finding (the read-to-save window), documented as a limit.
  - All three confirmed the 5639103 tests fail when the resend or the failure handling is broken, and that the Node lines and the double-quote sentence are true.
  - GLM 5.3 Flash and Composer 2.5 were skipped: Cursor usage limit until 2026-11-19.
  - The fixes after 1e0d65c were not reviewed again: a guide sentence, a comment, a check reorder with its tests, and a guide row.
- `NODE_ENV=test npx tsx --test tests/lh-submit.test.ts`: 15/15 at 4b9bf40.
- Full check at 759b539 (the final code; the ship commit adds only this ticket file): `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`, typecheck and lint clean, 3166/3167, the one failure the baseline Pi main-loader test.
- `bash .scratch/external-teacher/phase-c-smoke.sh 3731` at 759b539: PASS, 102 ok, 0 FAIL, including section 9b (`lh submit`) and the card-number match.
- Blast-radius skipped: Risk pre-release.
