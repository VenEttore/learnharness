# 22: Question card page for phone screenshots

Status: resolved
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: new route under app/chat/[id]/card (new files), new components if needed, new test files. Not docs/external-teacher.md (ticket 21 documents the flow).

From ticket 15's bench and Ven's choice (2026-11-01: "Question card page"). Ven answers from a phone. Taking over the bot's desktop from a phone works but is very slow. The flow Ven wants: the bot screenshots a phone-sized view of the lesson, sends the image in Grok Bot chat, Ven answers in a chat widget, and the bot saves the answer with `lh submit` (ticket 21).

**What to build:** a read-only page at `/chat/<lesson id>/card`, laid out for a phone-width screenshot (about 390 px wide), showing only what the learner needs to answer:

- [x] The open question, if any: its lead-in text, the question, and each option with its number (the number `lh submit` takes). Math renders the way the lesson page renders it (reuse the page's existing renderers so it looks the same). Shows the kind (probe, quiz, explain, ask, recall) and, for a free-recall or explain question, that a typed answer is expected.
- [x] The latest teaching text before it.
- [x] Where the lesson is: phase, and in plan or teach a compact view of the plan map with the current node marked, if the existing map component can render that small; otherwise the current node's title.
- [x] With no open question, the latest teaching text and "No open question".
- [x] No inputs and no buttons that change the lesson. It must not trigger any model call or a `continue` request.
- [x] Works for a bot-run lesson; for an ordinary lesson it may show the same view or a "bot-run lessons only" note (say which).
- [x] Tests: the card shows the open question and numbered options for a probe and a quiz, renders inline math from ticket 20's repro strings, and shows "No open question" when there is none.
- [x] A screenshot at 390 px wide of a probe and a quiz with math, committed under .scratch/external-teacher/ for the review.

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

### Shipped 2026-11-02
Completed:
- `/chat/<lesson id>/card` (app/chat/[id]/card/page.tsx, components/question-card.tsx, src/core/question-card.ts): a read-only card for a 390 px phone screenshot. It shows the phase, the open question (kind, lead-in, question, options numbered in the dock's shown order, "Typed answer expected" for explain, recall and option-less ask), the latest teaching text before it, and in plan or teach the plan map with "Now: <current node>". With no open question it shows the latest teaching text and "No open question".
- Ordinary lessons get the same card. Practice sessions get a note that the card covers lessons only.
- The dock and the card share `displayedQuestionOptions` (quiz and probe shuffled by call id, ask in authored order). The dock edit carries a Fork comment; the core barrel gained one export line.
- No inputs, no model call, no `continue`. In a browser the card hides the app shell, so a plain full-page screenshot holds just the card. Wide math, tables, code and inline formulas shrink to the column; very long code lines wrap; links render as plain links; the renderers' copy buttons are hidden.
- The plan map is dropped, and a mermaid chart replaced by a note, when its smallest visible label (node or edge) would read under 10 px. The chart check re-runs when mermaid resizes its svg.
- tests/question-card-page.test.tsx (21 tests). Screenshots, payloads, retake.sh, shot.mjs and check.sh are in .scratch/external-teacher/card-22/ (README.md has the capture report).

Deferred:
- Ticket 21: `lh submit` must map the learner's number through `displayedQuestionOptions` (`lh show` returns authored order, and `lh.mjs` cannot import it).
- Ticket 21: GLOSSARY entries "question card" and "lead-in".
- Accepted limit, not fixed (Ven, 2026-11-02): a gantt chart's date labels can overprint at 390 px. The rule checks label size, not overlap. Recorded in card-22/README.md and the code comment.

Verified:
- Final review round on `git diff feat/external-teacher...d85972e`. Code-review: Spec 0 findings; Standards no hard violations. Interrogate seats A (Opus 5.5) and C (Haiku 5.5) found 5 issues, all fixed and rerun:
  - edge labels were not measured (ER and class diagrams);
  - the chart rule judged a chart before mermaid resized it (an 8 px classDef label showed the chart in 0 of 16 loads; the note now shows in 16 of 16);
  - retake.sh's exit step killed whatever listened on its port (a repro with a foreign server now leaves it alive and the script fails with "next dev exited");
  - retake.sh's `ss | grep -q` port checks could fail open under pipefail;
  - the PID file was not cleared before the trap.
  GLM 5.3 Flash and Composer 2.5 seats skipped: Cursor usage limit until 2026-11-19.
- `bash .scratch/external-teacher/card-22/check.sh` (typecheck, lint, full suite at --test-concurrency=2) on fa66a6b: 3112 of 3113 pass. The only failure is the baseline Pi main-loader test. The merge of feat/external-teacher afterwards changed only .scratch/external-teacher/STATE.md.
- `NODE_ENV=test npx tsx --test tests/question-card-page.test.tsx`: 21 of 21.
- `bash .scratch/external-teacher/card-22/retake.sh`: 9 captures, each with documentWidth 390, nothing clipped or outside the card, no displayed controls, no non-GET requests; "server stopped".
- Blast radius: skipped (Risk: pre-release).
