updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  03 external-teacher-03-bot-talks-over-api node:delegated-task:command%3Amcp%3Ac6c92c30-704a-4b69-a950-617f497e7ae0%3Adelegate-task%3Aexternal-teacher-03-2 (worktree from handoff) running
touches-locked: 03
merged: 02 (33e1e55), 01 (0400540), 04 (8d77b94); check after each matches baseline
waiting on Matt: none
next: 03 relaunched (attempt 2, resume at review, rounds 4-6 of 8). On its handoff, validate and merge; then 05 is on the frontier. Ticket branches push to origin at every handoff; do not push feat/external-teacher or main until Matt says "ship it".
