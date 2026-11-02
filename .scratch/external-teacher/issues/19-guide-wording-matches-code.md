# 19: Guide, spec and comment wording matches the code

Status: resolved
Blocked by: 17
Risk: pre-release
Gate: none
Host: linuxdev
Touches: docs/external-teacher.md, .scratch/external-teacher/spec.md, comments and help text in scripts/lh.mjs and src/server/bot-run.ts

From ticket 17's ship comment (lines that word things differently from the code and the new glossary). The guide is what the Bot Teacher reads, so its lines matter most.

**What to build:** Fix each line in 17's list ("Guide, spec and code lines that differ from the glossary" in .scratch/external-teacher/issues/17-glossary-terms.md) so it matches the code and GLOSSARY.md. Confirm each against the code first; the code wins.

- [x] Guide lines 43, 45, 49, 51, 71, 209, 213 (and the "Cursor" product vs `cursor` position wording at :5, :197 if it can mislead).
- [x] spec.md stories 26, 27, 30, 32, line 120 and the glossary list at 204.
- [x] Comments and help text only in scripts/lh.mjs:17 and src/server/bot-run.ts:45, :303, :343. No behavior change.
- [x] src/core/contracts/probe.ts:94 is an upstream file: leave it unless the fix is one word.
- [x] GLOSSARY.md Bot Teacher's _Avoid_ "driver" line: fix if wrong.
- [x] Every JSON example in the guide still runs as before (rerun .scratch/external-teacher/phase-c-smoke.sh if any example or command text changed).

## Comments

### Shipped 2026-11-02
Completed:
- Guide (docs/external-teacher.md), checked against bot-run.ts and lh.mjs:
  - Exit 1 is any reply that is not ok: a refusal, a `bad_reply`, or other JSON. Exit 3 is not a refusal.
  - :47 says where other JSON on exit 1 comes from: another program, or a desktop-mode LearnHarness, whose exact reply it quotes.
  - The cursor paragraph (:49) names the replies without a cursor (`forbidden_*`, and lh's own `usage`, `unreachable`, `bad_reply` and `--wait` timeout). "Your first turn" and "any earlier turn" now say "a saved Bot Teacher turn".
  - Items (:51) and the `unread_input` row (:213) count from the last saved Bot Teacher turn, whichever Bot Teacher took it.
  - :71 says a repeat is accepted in any phase.
  - :209 says a refused turn adds nothing to the transcript, and the `--wait` timeout is off its refusal list.
  - "Cursor" the product is now "the Cursor app" at :5, :197 and :205.
- spec.md: stories 26, 27, 30 and 32, check 4 (:120), the exit-code line (:136), the Cursor app wording (:13), and the glossary list (:204, now all 14 terms).
- GLOSSARY.md: the Bot Teacher's _Avoid_ "driver" says it is the code's name for the lesson field.
- Comments only: lh.mjs exit-code header; bot-run.ts `BOT_RUN_LESSON_CODE` (continue, retry and server-origin steers), `showBotLesson` (no "taking over"), and `Checked` ("a failed check"). No behavior change.
- probe.ts:94 left alone (upstream, model-facing, more than one word).
Deferred, not filed (left to the final spec review):
- Guide :32 (step 5) passes on any exit 1, including a desktop-mode reply. Section 3's lesson-file check and :47 still catch it.
- Guide :47 has no case for "your server is already up on another port while LH_URL points elsewhere".
- Guide :143 ("send plan again whenever the map is wrong") does not mention that an open question refuses it. Line 84 covers that.
- spec.md:81 says any non-page input gets `bot_run_lesson`. Over HTTP an unknown type gets 400 with no code; only the internal steers path carries it.
- lh.mjs:17 and spec.md:136 say "JSON without "ok":true", but `{"ok":true}` on a non-2xx status also exits 1. The main clause, "any reply that is not ok", covers it.
Verified:
- Repo check on the merged tip d9f7961 (integration tip 29db31c merged in): `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`. Typecheck and lint pass. Tests: 3091/3092. The one failure is the baseline entry ("main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network").
- `git diff --check` clean. Code files changed only in comments.
- Smoke (phase-c-smoke.sh) not rerun: no guide JSON example or command text changed.
- Review: 5 rounds of code-review (Standards and Spec, Opus 5.5 xhigh) and interrogate (seat A Opus 5.5 xhigh in place of Grok 4.7; seat C Haiku 5.5 xhigh). Seats ran lh against real servers and fake servers. Round 5: both code-review axes pass, and interrogate has no Act On items from either seat. Seats B (GLM 5.3 Flash) and D (Composer 2.5) were skipped: Cursor usage limit on their one try, resets 2026-11-19. Some round 3 launches hit Claude rate limits and were retried.
- Blast radius: skipped (Risk: pre-release).
