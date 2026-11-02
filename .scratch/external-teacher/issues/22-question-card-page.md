# 22: Question card page for phone screenshots

Status: claimed
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: new route under app/chat/[id]/card (new files), new components if needed, new test files. Not docs/external-teacher.md (ticket 21 documents the flow).

From ticket 15's bench and Ven's choice (2026-11-01: "Question card page"). Ven answers from a phone. Taking over the bot's desktop from a phone works but is very slow. The flow Ven wants: the bot screenshots a phone-sized view of the lesson, sends the image in Grok Bot chat, Ven answers in a chat widget, and the bot saves the answer with `lh submit` (ticket 21).

**What to build:** a read-only page at `/chat/<lesson id>/card`, laid out for a phone-width screenshot (about 390 px wide), showing only what the learner needs to answer:

- [ ] The open question, if any: its lead-in text, the question, and each option with its number (the number `lh submit` takes). Math renders the way the lesson page renders it (reuse the page's existing renderers so it looks the same). Shows the kind (probe, quiz, explain, ask, recall) and, for a free-recall or explain question, that a typed answer is expected.
- [ ] The latest teaching text before it.
- [ ] Where the lesson is: phase, and in plan or teach a compact view of the plan map with the current node marked, if the existing map component can render that small; otherwise the current node's title.
- [ ] With no open question, the latest teaching text and "No open question".
- [ ] No inputs and no buttons that change the lesson. It must not trigger any model call or a `continue` request.
- [ ] Works for a bot-run lesson; for an ordinary lesson it may show the same view or a "bot-run lessons only" note (say which).
- [ ] Tests: the card shows the open question and numbered options for a probe and a quiz, renders inline math from ticket 20's repro strings, and shows "No open question" when there is none.
- [ ] A screenshot at 390 px wide of a probe and a quiz with math, committed under .scratch/external-teacher/ for the review.

## Comments

### Stopped at the review cap 2026-11-02
Built (branch external-teacher-22-question-card-page):
- `/chat/<lesson id>/card`, a read-only card for a 390 px phone screenshot. It shows the phase, the open question (kind, lead-in, question, numbered options, "Typed answer expected" for explain, recall and option-less ask), the latest teaching text, and in plan or teach the plan map with "Now: <current node>". The map is dropped when its titles would read under 10 px. With no open question it shows the latest teaching text and "No open question".
- Ordinary lessons get the same card. Practice sessions get a note that the card covers lessons only.
- Option numbers are 1-based in the order the lesson page's dock shows. The dock and the card share `displayedQuestionOptions` (quiz and probe shuffled by call id, ask in authored order).
- The page reads the stored record only: no inputs, no model call, no `continue`. In a browser the card hides the app shell, so a plain full-page screenshot holds just the card. Wide math, tables, code and inline formulas shrink to the column, very long code lines wrap, and a chart whose smallest label would read under 10 px shows a note.
- Tests: tests/question-card-page.test.tsx (21). Screenshots, payloads, retake.sh and shot.mjs are in .scratch/external-teacher/card-22/ (README.md has the capture report).

Review: 9 interrogate rounds, plus code-review in rounds 1, 7, 8 and 9. Round 9 code-review passed (Spec clean, Standards with no hard violations). Round 9 interrogate was not clean. Its open items:
- Fixed at 84a8062, not reviewed: a chart was judged by its first label (a title), so xy and quadrant charts with 7 to 8 px ticks stayed. It now uses the smallest label.
- Fixed at 2dc2426, not reviewed: retake.sh restores AGENTS.md from a snapshot and refuses a busy port 3722. Its exit step still kills whatever listens on 3722; after the start check that should only be its own server.
- Open: a gantt chart's day ticks overprint at 390 px (labels 9.2 px, over the threshold). Either add an overlap check or accept it as a gantt-only limit.

Deferred:
- Ticket 21: `lh submit` must map the learner's number through the dock's shown order (`displayedQuestionOptions`). `lh.mjs` cannot import it and `lh show` returns authored order, so 21 needs the shown order over HTTP or a copy of the seeded shuffle.
- Ticket 21: GLOSSARY entries for "question card" and "lead-in".
