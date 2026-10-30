# 15: Bench: one real lesson with a Grok Bot

Status: open
Blocked by: 14
Risk: pre-release
Gate: human
Host: laptop
Touches: none

Phase D (its own verification).

**What to build:** Nothing. The owner and a Grok Bot run one real lesson on the bot computer.

- [ ] On the bot computer, LearnHarness is started per the guide, with no API keys.
- [ ] A Grok Bot runs one full lesson (probe, plan, teach) with the owner.
- [ ] On the page, the owner types, answers, skips and reloads, and checks:
  - no error banner;
  - no `continue` request in the browser's network tab;
  - the sidebar updates phase and question-waiting;
  - the plan map shows.
- [ ] No model-error or setup dialog appears.
