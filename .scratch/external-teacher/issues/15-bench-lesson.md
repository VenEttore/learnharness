# 15: Bench: one real lesson with a Grok Bot

Status: resolved
Blocked by: 14
Risk: pre-release
Gate: human
Host: laptop
Touches: none

Phase D (its own verification).

**What to build:** Nothing. The owner and a Grok Bot run one real lesson on the bot computer.

- [x] On the bot computer, LearnHarness is started per the guide, with no API keys.
- [x] A Grok Bot runs one full lesson (probe, plan, teach) with the owner.
- [x] On the page, the owner types, answers, skips and reloads, and checks:
  - no error banner;
  - no `continue` request in the browser's network tab;
  - the sidebar updates phase and question-waiting;
  - the plan map shows.
- [x] No model-error or setup dialog appears.

## Comments

### Bench passed 2026-11-01 (Ven-approved report relayed by Agentic IDE Watcher)
Branch external-teacher-15-bench at b2d80fc, on the Grok Bot computer (LH_DATA_DIR=/workspace/lh-data, 127.0.0.1:3000, no keys). Lesson chat_mvxc52d6_582ae133 ("Binary search", key binary-search-1, driver external) ran probe, plan and teach to the end; `lh show` ends at phase teach, no open question. Every lh command in the guide behaved; phase gates and the one-open-question rule held; plan node ids, tagged quiz/explain, probe shuffle and "I don't know", thinking and confidence on page answers all worked.
Findings opened as tickets:
- P0 LaTeX in question presentation details is corrupted ($n/2^k$ becomes /2^k$): ticket 20.
- P1 confidence-before-grade for answers that don't come from the page, P2 a remote/mobile learner path (no desktop takeover), P3 note the first-compile sidebar messages: ticket 21.
Setup friction (not product bugs): wrong first checkout, box default Node 20 (guide's Node 22 was right), the bot's own teacher-state.json went stale. One pedagogy miss (a wrong walkthrough answer, then a reteach), not a product bug.
Re-bench: after 20 and 21 merge, on a fresh bench branch, follow-up tests 1-6 from the report.
