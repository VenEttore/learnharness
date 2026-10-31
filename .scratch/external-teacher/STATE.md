updated: 2026-10-30
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  01 external-teacher-01-shared-tool-helpers node:delegated-task:command%3Amcp%3Ac44b857c-1bf3-4cae-977d-9bf3323ef477%3Adelegate-task%3Aexternal-teacher-01-1 /home/matt/.t3/worktrees/learnharness/t3-4ef9bc38 running
  04 external-teacher-04-page-in-bot-run-lesson node:delegated-task:command%3Amcp%3A58a1684e-a44c-4dde-b618-fd555a4849fd%3Adelegate-task%3Aexternal-teacher-04-1 (worktree from handoff) running
  03 external-teacher-03-bot-talks-over-api node:delegated-task:command%3Amcp%3A9fdc9f2a-563c-4609-bc1a-bba2e263ecdf%3Adelegate-task%3Aexternal-teacher-03-1 /home/matt/.t3/worktrees/learnharness/t3-3dc68266 waiting
touches-locked: 01, 03, 04
merged: 02 (33e1e55; check matches baseline)
waiting on Matt: 03 stopped at the 3-round review cap (tip 68d9676; round-3 fixes unreviewed); needs "Continue" for one more round, plus a look at its added refusals and cursor choices
next: both slots are full (01, 04). 03 waits on Matt. Ticket branches push to origin at every handoff; a shipped commit must be the pushed tip. Do not push feat/external-teacher or main until Matt says "ship it". On a handoff, validate it, merge or relaunch, then launch the next frontier ticket if a slot is free.
