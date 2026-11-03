# 26: Card option order from `lh`, and phone-ready guide fixes

Status: claimed
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts or the external routes (openQuestion shape), scripts/lh.mjs if needed, docs/external-teacher.md, new tests

From Ven's first real Bot Teacher lesson (Japanese, lesson chat_mw07rfk7_4f0b8b89, 2026-11-03, relayed by the Watcher). Matt chose to do the code fix and the guide fixes now (2026-11-03).

## Code

- [ ] `lh show` and `lh answer`: `openQuestion` carries the options as the card numbers them, e.g. `options: [{"number":1,"label":"...","value":"..."}, ...]`, in the order of the shared `displayedQuestionOptions` (the helper the lesson page, the card and `lh submit` already use). For a question without options, leave it out or make it empty; say which. Today the bot screenshots the card on almost every question only to learn this order, which made the lesson stop-start.
- [ ] Tests: shuffled `probe` and `quiz` numbers match the card and what `lh submit` saves for the same number; `ask` keeps authored order; a question without options.

## Guide (docs/external-teacher.md)

- [ ] Phone-ready step list: read the option numbers from `openQuestion.options`; open or screenshot the card only for a question holding something chat cannot show (diagram, table, laid-out code). Remove "read the option order from the card every time".
- [ ] Send the lead-in, the question and the widget together, so nothing arrives after the question. Don't announce saving ("Got pick N at C, saving"); save silently.
- [ ] "I don't know" ends the question: no confidence step after it. If the widget cannot skip a step, ask confidence in a second widget sent only after a real pick. (`lh submit` already accepts "I don't know" without a confidence and refuses one with it.)
- [ ] Invite reasoning on every question with options: free text on, with a short hint such as "Optional: add why".
- [ ] Lesson state lives in LearnHarness. Resume with `lh show <lesson id>`; start fresh with a new lesson. Any notes the bot keeps name the lesson id and date, so an old file never looks like a lesson to resume.
- [ ] An "Updating" step: `git fetch origin && git checkout main && git reset --hard origin/main`, `npm ci`, restart the server. Note that a clone made with `--single-branch` or `--depth` fetches only one branch; `git remote set-branches origin '*'` fixes it.
