updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  03 external-teacher-03-bot-talks-over-api node:delegated-task:command%3Amcp%3A9fdc9f2a-563c-4609-bc1a-bba2e263ecdf%3Adelegate-task%3Aexternal-teacher-03-1 /home/matt/.t3/worktrees/learnharness/t3-3dc68266 waiting
  04 external-teacher-04-page-in-bot-run-lesson node:delegated-task:command%3Amcp%3A58a1684e-a44c-4dde-b618-fd555a4849fd%3Adelegate-task%3Aexternal-teacher-04-1 /home/matt/.t3/worktrees/learnharness/t3-458de5eb waiting
touches-locked: 03, 04
merged: 02 (33e1e55), 01 (0400540); check after each matches baseline
waiting on Matt: 03 stopped at the 3-round cap (tip 68d9676; round-3 fixes unreviewed; added refusals and cursor choices to confirm). 04 stopped at the 3-round cap (tip e7cd1df; round-3 fix unreviewed; page.tsx botRun pass-through untested). Each needs "Continue" for one more round (rounds 4 of 8).
next: nothing launchable; 05 waits on 03 and 04. On "Continue NN", relaunch with a brief to resume at the review step, review rounds remaining 1+. Ticket branches push to origin at every handoff; do not push feat/external-teacher or main until Matt says "ship it".
