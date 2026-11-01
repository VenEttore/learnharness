# 22: Question card page for phone screenshots

Status: open
Blocked by: 20
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
