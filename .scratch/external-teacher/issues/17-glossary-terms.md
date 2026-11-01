# 17: Glossary terms for bot-run lessons

Status: resolved
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: GLOSSARY.md

From the final spec review (item 2, Matt approved 2026-11-01). Deferred by ticket 13.

**What to build:** Add the terms docs/external-teacher.md and the spec use to GLOSSARY.md, in its existing format: cursor, turn, item, repeat, takeover, strand, refusal. Check each definition against src/server/bot-run.ts, scripts/lh.mjs and the guide. Check which of bot-run lesson, Bot Teacher and driver are already there and add any that are missing.

- [x] Each term defined in one or two sentences, consistent with the guide and the code.
- [x] The guide's wording and the glossary agree; if they differ, the glossary follows the code and the ticket notes the guide line (do not edit the guide here unless the fix is one word).

## Comments

### Shipped 2026-11-01
Completed:
- GLOSSARY.md: added Item and Strand under Lessons, a new Turns section (Turn, Cursor, Repeat, Refusal), and Takeover under Bots.
- GLOSSARY.md: Learner input now says "last saved Bot Teacher turn", counts from the lesson's start when there is none, and counts any Bot Teacher's turn. Phase no longer uses its avoided word "stages" and says which turns each phase saves.
- docs/external-teacher.md:221: one-word fix, "rejected" to "refused", to match Refusal.
- Bot-run lesson and Bot Teacher were already there. Driver gets no entry of its own: it is the lesson record's field, already named under Bot-run lesson's _Avoid_.

Guide, spec and code lines that differ from the glossary (the glossary follows the code):
- guide:43 and lh.mjs:17 say exit 1 is "refused or bad input". A `bad_reply` also exits 1 and is not a refusal.
- guide:45: exit 3 (unreachable or no answer) is not a refusal, and the turn may have landed.
- guide:49: "until you have taken your first turn" and "any earlier turn" mean saved turns, by any Bot Teacher. "Every reply ... carries cursor" is also too broad: lh's `usage` refusal carries none (guide:209 says so).
- guide:51: "everything after your last turn" means the last saved Bot Teacher turn, whichever Bot Teacher took it.
- guide:71: "A turn that does not fit is refused with wrong_phase". A repeat of any kind is accepted in any phase (check 3 runs before check 6).
- guide:209: "a refused turn saved nothing". A plan turn's `save_failed` can follow the tree save (bot-run.ts saveFirst); the transcript gets nothing. guide:209 also lists a `--wait` timeout among refusals, but that reply has no code.
- guide:213 and spec.md:120: "input after your cursor" alone. The code requires input newer than both the cursor and the last saved Bot Teacher turn (spec.md:194 states it correctly).
- spec.md:48 (story 26): "every command returns a cursor". lh's usage refusal does not.
- spec.md:49 (story 27): "since my last turn" means the last saved Bot Teacher turn.
- spec.md:52 (story 30): "safe to repeat" for reads. Repeat in the glossary means a resent turn.
- spec.md:54 (story 32) and bot-run.ts:303: "take over" / "taking over" for a later bot resuming a lesson. The glossary keeps takeover for the learner and lists that use under Takeover's _Avoid_. src/core/contracts/probe.ts:94 says "takes over" for the teaching phase.
- spec.md:204: its glossary list predates these terms.
- bot-run.ts:45: "the refusal code every bot-run refusal carries". Only page-input refusals carry `bot_run_lesson`. bot-run.ts:343 uses "refusal" for an internal check result.
- GLOSSARY.md Bot Teacher _Avoid_ "driver" (older line): in the code, driver is a field on the lesson, not the agent.
- The guide writes "Cursor" for the product (guide:5, :197) and `cursor` for the lesson position. The glossary heading Cursor is the position.

Deferred: the guide and spec line fixes above, which are more than one word each. Not filed as a ticket; left to the final spec review.
Verified:
- Repo check on the merged tip 438a75c: `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`. Typecheck and lint pass. Tests 3091/3092; the one failure is the baseline entry ("main loader resolves Pi's import-only PUBLIC package exports and native OAuth without a CLI or network").
- `git diff --check` clean.
- Review: 9 rounds of code-review (Standards and Spec, Opus 5.5 xhigh) and interrogate (seat A Opus 5.5 xhigh in place of Grok 4.7, seat C Haiku 5.5 xhigh). Round 9: both axes pass, and interrogate has no glossary Act On items, only the note corrections above. Seats B (GLM 5.3 Flash) and D (Composer 2.5) were skipped: Cursor usage limit at startup, retried once each, resets 2026-11-19.
- Blast radius: skipped (Risk: pre-release).
