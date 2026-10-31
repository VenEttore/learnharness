updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  06 external-teacher-06-probe-questions node:delegated-task:command%3Amcp%3A40185c39-8fbd-4748-b3b9-188b649c9726%3Adelegate-task%3Aexternal-teacher-06-1 (worktree from handoff) running
  08 external-teacher-08-extraction-blocked node:delegated-task:command%3Amcp%3A40185c39-8fbd-4748-b3b9-188b649c9726%3Adelegate-task%3Aexternal-teacher-08-1 (worktree from handoff) running
touches-locked: 06, 08
merged: 02 (33e1e55), 01 (0400540), 04 (8d77b94), 03 (e51624e), 05 (phase A verified; .scratch only); check after each code merge matches baseline
notes: 03 round 5 code-review did not run (Grok 4.7 provider error twice, no substitute); last code-review was round 4 on a6b7044, ~25 lines of bot-run.ts changed after it and were covered only by round-5 interrogate (3 seats).
waiting on Matt: none
next: 06 and 08 running. 07 follows 06; 09 (verify phase B) follows 06, 07, 08. Ticket branches push to origin at every handoff; do not push feat/external-teacher or main until Matt says "ship it".
