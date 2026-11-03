# 27: Merge upstream 0.4.1

Status: open
Blocked by: 26
Risk: pre-release
Gate: none
Host: linuxdev
Touches: everything upstream changed (131 files); conflicts predicted in components/chat.tsx and src/agent/tools/probe.ts

Upstream main (e69e852, release 0.4.1) is 63 commits ahead of the fork's base. It tuned the extraction prompts and duplicate checker the bot-run graph work (28-30) will copy. Matt chose to start the graph work (2026-11-03); this merge goes first.

- [ ] Merge upstream/main into the ticket branch with a merge commit (no rebase, no squash). Resolve components/chat.tsx and src/agent/tools/probe.ts keeping both upstream's change and the fork's (the "Replaced by a later plan" wrapper from 25; whatever the fork changed in probe.ts, found with git log).
- [ ] Check every file the fork edits upstream still behaves: chat.tsx, question-dock.tsx, input-events.ts, src/store/chats.ts, extraction.ts (ticket 08's driver check still returns before any model call), core/index.ts.
- [ ] The full check and phase-c-smoke.sh pass; the card's retake.sh still reports 390 with nothing clipped. Note any new upstream baseline failures, run against upstream/main alone, so they are not blamed on the fork.
- [ ] AGENTS.md keeps the fork section below the Next.js block.
