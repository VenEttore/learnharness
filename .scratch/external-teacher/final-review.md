# external-teacher: final spec review packet

Updated 2026-11-02 at integration tip 53aab60. Every ticket (01-22) is merged. Bench 3 (`external-teacher-bench-3` @ 5d5ca58, same code apart from the AGENTS.md revert below) passed with one partial item and no blockers. The spec ships on "ship it" from Ven or Matt in their own words.

## What shipped

| Ticket | Shipped | Merge |
|---|---|---|
| 01 | Teaching tools' result text and plan-node check moved to a shared module (src/core/teaching-tool-results.ts) so the bot path reuses them | 0400540 |
| 02 | A bot-run lesson (`driver` set) saves page input and never reaches the model, key or compaction gates; continue/retry refused | 33e1e55 |
| 03 | External routes under app/api/external/chats/**, the `lh` CLI, `lesson new` with an idempotent key, `say`, `show`, the cursor and turn checks 1-4, Origin/Host guard | e51624e |
| 04 | The page works in a bot-run lesson: no automatic continue, no setup or model-error prompts | 8d77b94 |
| 05 | Phase A verified by smoke run | .scratch only |
| 06 | `ask`, `probe`, `recall` turns with checks 5-7 | 8247cca |
| 07 | `lh answer` items for typed messages, answers and skips; `--wait`; dismiss route emits chats-changed and no longer overwrites a racing answer | 5929722 |
| 08 | Knowledge extraction returns empty for a bot-run lesson | 2e93d6c |
| 09 | Phase B verified by smoke run | .scratch only |
| 10 | `probe-done` with strand assessments; moves the lesson to plan, wakes nothing | 17ab05a |
| 11 | `plan` (Mermaid), parser errors as 422, rewrites during teach; check/build throws become JSON 500 internal_error | 439f106 |
| 12 | `quiz` and `explain` tagged with a plan node; node check reads the latest plan in the transcript; retried question after a rewrite is a repeat | 4c38b64 |
| 13 | docs/external-teacher.md, the Bot Teacher guide | 815aa6d |
| 14 | Phase C verified: the guide's start command, loopback only, a scripted no-key lesson (78 checks) | b2d80fc |
| 15 | Bench 1 with a Grok Bot: PASS (Ven, 2026-11-01). Findings became 20, 21, 22 | .scratch only |
| 16 | writeChat writes a temp file and renames it, so a cut-off write can't leave a lesson unreadable (upstream file, small edit) | d5f063c |
| 17 | GLOSSARY terms: cursor, turn, item, repeat, takeover, strand, refusal | 675e146 |
| 18 | Tests for bad_reply, exit 3, a failed `lesson new` save, unread_input past the bot's last turn | 8ae6d47 |
| 19 | Guide, spec and code comments match the code | 522de4e |
| 20 | Authored question text survives hand-built answers: on save, question text, explanation and commitment come from the stored question call; option rows and picks are restored only for page-shaped requests; anything unmodeled is stored as sent. Covers ordinary lessons too. B2 fix from bench 2 | 0504637 |
| 22 | Read-only question card at /chat/<id>/card for 390 px phone screenshots: phase, open question with options in the page's order, latest teaching, plan map; unreadable charts become a note | 0673052 |
| 21 | `lh submit`: saves an answer or skip through the page's own routes and record, options numbered in card order, confidence required for quiz and probe picks unless "I don't know", bad picks and stale cursors refused before sending, retries are repeats. Guide: answering from a phone or chat, Grok Bot notes and stand-in table, quoting rules, known limits, Node version line. GLOSSARY "Question card", "Lead-in". Smoke section 9b | 5d5ca58 |

## Final integration check

Ticket 21 ran it at 759b539, whose code equals the merge 5d5ca58: typecheck and lint pass, 3166 of 3167 tests pass, and phase-c-smoke.sh passes (102 checks, 0 failed). The one failing test is the baseline "main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network". It fails on main before this work and has nothing to do with the fork. 53aab60 adds only .scratch files and the AGENTS.md revert.

## Known limits (accepted)

- Ticket 20, gap A: an option with a backslash right before a newline, sent in a double-quoted shell body, can store the pick under another option's label.
- Ticket 20, B1: a shell variable that is set (e.g. m=2) can make one option's text look like another's.
- `$?`, `$$` and `$(...)` leftovers from a double-quoted body stay as sent; bash also runs `$(...)` from lesson text while building such a body. The guide forbids double-quoted bodies; bench 2 found --file, a single-quoted heredoc and curl --data-binary @file clean in every case.
- The server stores any confidence value and trusts `correct` from the client (both predate the fork). `lh submit` enforces the page's values.
- A message the learner types between `lh submit`'s read and its save is not refused; it comes back in the reply's items. Listed in the guide.
- `lh` on Node older than 14.13.1 crashes before it can print the node_version refusal. The guide names the versions that were run.
- Card: gantt chart date labels overlap at 390 px (Ven, 2026-11-02).

## Spec decisions taken during the work

1. Spec Out of Scope wording on two writers (from 07) corrected at ship.
2. LH_IGNORE_ENV_KEYS=1 leaves some provider credentials in effect; the guide unsets them. Accepted.
3. Upstream prompt 20-teaching.md:33 mismatch. Accepted.
4. Upstream compactAnswerForModel crashes on a null pick entry; `lh submit` refuses null picks before sending. Upstream code unchanged.

## Not re-reviewed after the last round

- 20: the narrowed B2 rule (3958658). Covered by the reviewers' cases as tests and the full check.
- 21: a guide sentence, a code comment, the closed-question checks moved before validation (with two tests), and the read-to-save guide row. Covered by the full check and smoke.
- 22: none.

## Reviews and seats

- No Needs-hardware findings. No Risk: live tickets, so no blast-radius.
- Review skipped under the small-diff rule: 05, 08, 09, 14, 16, 18.
- 03 round 5: code-review did not run (Grok 4.7 provider errors twice). Round 4 code-review passed; round 5 interrogate clean.
- 13 round 2: Haiku seat never started (T3 MCP timeout during the linuxdev outage).
- From 2026-10-31, code-review and the Grok 4.7 interrogate seat ran on Opus 5.5 xhigh (Matt, this project only).
- GLM 5.3 Flash and Composer 2.5 seats skipped from 17 onward: Cursor usage limit until 2026-11-19.
- Review round cap reinstated 2026-11-02 (8 per ticket, 3 per launch). Over the cap with Continue: 20 (9 rounds), 22 (10), 21 (4, under the cap).

## Benches

- Bench 1 (ticket 15, 2026-11-01): PASS. P0 was bot shell quoting corrupting LaTeX, fixed by 20 and made avoidable by 21.
- Bench 2 (2026-11-02, integration + 20 at its cap): LaTeX regression PASS 24/24; safe transports clean; gaps A and B reproduced; B2 fixed afterwards in 20.
- Bench 3 (`external-teacher-bench-3` @ 5d5ca58, 2026-11-02, Ven's test bot): 6 of 7 PASS, 1 PARTIAL, no blockers. Artifacts on the bot box in /workspace/bench3/.
  - PASS: the card + `lh submit` flow end to end (a shuffled probe stored the right option, and `lh answer` agrees); every `lh submit` refusal, cursor case and retry; card option order on shuffled quizzes; math conversion and KaTeX on the card; ticket 15 follow-ups 1-6 (rebuilt from issue 15's checklist); the B2 spot check (Alice stored through every transport and through `lh submit`).
  - PARTIAL: plan diagram on a phone. Narrow plans (at most 2 nodes side by side) are readable, if tall. A 14-node plan 4 nodes wide is dropped from the card ("Now: ..." only), and in a simulated 340 px chat its labels are about 5 px. The guide should tell the bot to keep plans to at most 2 columns with short labels. Not tested on a real phone.
  - Not tested: live chat widgets with Ven (the bot exercised `lh submit` directly).

## Fixed by the parent

- 53aab60 restores the AGENTS.md heading level that ticket 21 changed (`#` to `##`) by accident.

## Separate from the spec

README section on the fork's goals: branch readme-fork-goals (cffce62, pushed to origin), off main. Ships to main with "ship it" unless Matt says otherwise.
