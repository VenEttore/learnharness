# 26: Card option order from `lh`, and phone-ready guide fixes

Status: claimed
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts or the external routes (openQuestion shape), scripts/lh.mjs if needed, docs/external-teacher.md, new tests

From Ven's first real Bot Teacher lesson (Japanese, lesson chat_mw07rfk7_4f0b8b89, 2026-11-03, relayed by the Watcher). Matt chose to do the code fix and the guide fixes now (2026-11-03).

## Code

- [x] `lh show` and `lh answer`: `openQuestion` carries the options as the card numbers them, e.g. `options: [{"number":1,"label":"...","value":"..."}, ...]`, in the order of the shared `displayedQuestionOptions` (the helper the lesson page, the card and `lh submit` already use). For a question without options, leave it out or make it empty; say which. Today the bot screenshots the card on almost every question only to learn this order, which made the lesson stop-start.
- [x] Tests: shuffled `probe` and `quiz` numbers match the card and what `lh submit` saves for the same number; `ask` keeps authored order; a question without options.

## Guide (docs/external-teacher.md)

- [x] Phone-ready step list: read the option numbers from `openQuestion.options`; open or screenshot the card only for a question holding something chat cannot show (diagram, table, laid-out code). Remove "read the option order from the card every time".
- [x] Send the lead-in, the question and the widget together, so nothing arrives after the question. Don't announce saving ("Got pick N at C, saving"); save silently.
- [x] "I don't know" ends the question: no confidence step after it. If the widget cannot skip a step, ask confidence in a second widget sent only after a real pick. (`lh submit` already accepts "I don't know" without a confidence and refuses one with it.)
- [x] Invite reasoning on every question with options: free text on, with a short hint such as "Optional: add why".
- [x] Lesson state lives in LearnHarness. Resume with `lh show <lesson id>`; start fresh with a new lesson. Any notes the bot keeps name the lesson id and date, so an old file never looks like a lesson to resume.
- [x] An "Updating" step: `git fetch origin && git checkout main && git reset --hard origin/main`, `npm ci`, restart the server. Note that a clone made with `--single-branch` or `--depth` fetches only one branch; `git remote set-branches origin '*'` fixes it.

## Comments

### Stopped at the review cap 2026-11-03
Completed:
- `lh show` and `lh answer` report `openQuestion.options`: `[{number, label, value}]`, plus `description` on an `ask` option, numbered as the card numbers them (the shared `displayedQuestionOptions` order). It is always present on an open question, and `[]` for a question without options (`recall`, `explain`, an `ask` without options) or an input that does not parse.
- One numbering function in src/core/question-card.ts (`numberedOptionsOf`, with `parsedQuestionInput` for the per-kind parse). The card and `lh show` both call it, so they cannot drift. `numberedQuestionOptions` is the export bot-run.ts uses.
- Tests in tests/lh-submit.test.ts: for a shuffled `probe` and a shuffled `quiz` (reached through probe-done and plan), each number on a fresh lesson matches the card, and `lh submit` saves the option `lh` reported for it; `lh answer` equals `lh show`; at least one lesson's order differs from the authored one. An `ask` keeps its authored order and its description. `recall` and an `ask` without options give `[]`. The exact-shape test in tests/bot-run-api.test.ts now includes `options`.
- Guide (docs/external-teacher.md), "Answers outside the page":
  - read numbers and labels from `openQuestion.options`; show labels, never values.
  - open or screenshot the card only for a diagram, table or laid-out code, with the screenshot in the same message as the question.
  - send the lead-in, question, options and widget together.
  - save silently.
  - "I don't know" ends the question, with a second widget for confidence when the widget cannot skip a step.
  - invite reasoning with "Optional: add why".
  - one rule for `other` and `thinking`.
  - a single-select `ask` takes a pick or `other`, never both.
  - an `ask` without options takes `text` whatever its `multiSelect` says.
- Guide, section 1: an Updating step (`git fetch`, `checkout main`, `reset --hard origin/main`, `npm ci`, rebuild for a production build, restart), and the `git remote set-branches origin '*'` fix for a `--single-branch` or `--depth` clone. Section 5: lesson state lives in LearnHarness; resume with `lh show`, start fresh with a new lesson, and any notes name the lesson id and date.
- `scripts/lh.mjs` needed no change, because it passes `openQuestion` through as the server sends it.

Deferred:
- Round 3 was not clean. Interrogate A and C each proved one guide gap with the same cause: an `ask` with `multiSelect: true` and no options read as a pick question under step 2, so a bot sent `picks` or `other` and `lh submit` refused them. The fix (commit 09b4592, guide only) is unreviewed: one review round on it is still owed.
- Not done, judgement calls: `answer-submit.ts` keeps its own copy of the select-or-text rule and the per-kind parse, from before this ticket. The turn boundary still accepts `multiSelect` on an `ask` without options (`askInputSchema` is upstream code; the guide covers it instead).

Verified:
- Review: 3 rounds of code-review (Opus 5.5 xhigh) and interrogate (A: Opus 5.5 xhigh, C: Haiku 5.5 xhigh).
  - Round 1: 3 findings, all guide, all fixed: the card sentence read as "always open the card", the Updating step lacked the production rebuild, and `other` and `thinking` had two rules.
  - Round 2: 1 finding, the duplicated per-kind parse, fixed.
  - Round 3 at bf932e4: code-review Pass with 0 findings. A and C found 1 finding each, with the same cause; it is fixed in 09b4592 and unreviewed.
  - Seats fuzzed show, card and submit numbering over thousands of inputs and call ids, with 0 mismatches.
- Repo check at 09b4592 (code unchanged since ba75068): `npm run typecheck` and `npm run lint` clean; `NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx` gave 3184 of 3185 passing. The one failure is the baseline ("main loader resolves Pi's import-only PUBLIC package exports...").
- `bash .scratch/external-teacher/phase-c-smoke.sh 3127`: PASS, 0 FAIL lines, at 09b4592 and at e6d330d.
- blast-radius: skipped (Risk: pre-release).
