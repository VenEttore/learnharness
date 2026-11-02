# 23: Narrow plans on a phone

Status: resolved
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: docs/external-teacher.md

From bench 3 (2026-11-02, Ven's test bot, item 4 PARTIAL): a 14-node plan 4 nodes wide is dropped from the question card (only "Now: ..." shows), and in a simulated 340 px chat its labels are about 5 px. Plans at most 2 nodes wide were readable, if tall. Ven asked for one guide line before ship, with review rounds skipped.

- [x] Guide: keep plans at most 2 nodes side by side with short labels; if a plan has to be wide, send the card's plan view as a screenshot instead of the mermaid text.

## Comments

2026-11-02, shipped. Added the "Plans on a phone" paragraph to docs/external-teacher.md, after "Math in chat" in the out-of-page section. Docs only. Review rounds skipped on Ven's instruction (small-diff rule). Not done: no check in `lh plan` for plan width, and no test on a real phone; both are left as they are.
