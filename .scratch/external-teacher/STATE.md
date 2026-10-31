updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  05 external-teacher-05-verify-phase-a node:delegated-task:command%3Amcp%3A40185c39-8fbd-4748-b3b9-188b649c9726%3Adelegate-task%3Aexternal-teacher-05-1 (worktree from handoff) running
touches-locked: 05 (Touches: unknown, locks everything)
merged: 02 (33e1e55), 01 (0400540), 04 (8d77b94), 03 (e51624e); check after each matches baseline
notes: 03 round 5 code-review did not run (Grok 4.7 provider error twice, no substitute); last code-review was round 4 on a6b7044, ~25 lines of bot-run.ts changed after it and were covered only by round-5 interrogate (3 seats).
waiting on Matt: none
next: 05 running alone (Touches: unknown). On its handoff, validate and merge; then 06 and 08 are on the frontier. Ticket branches push to origin at every handoff; do not push feat/external-teacher or main until Matt says "ship it".
