updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  07 external-teacher-07-answers-and-skips node:delegated-task:command%3Amcp%3A6fec9165-77a4-41de-bcbf-c6e23d2c0bd0%3Adelegate-task%3Aexternal-teacher-07-1 (worktree from handoff) running
touches-locked: 07
merged: 02 (33e1e55), 01 (0400540), 04 (8d77b94), 03 (e51624e), 05 (phase A verified; .scratch only), 08 (2e93d6c), 06 (8247cca); check after each code merge matches baseline
notes: 03 round 5 code-review did not run (Grok 4.7 provider error twice, no substitute); last code-review was round 4 on a6b7044, ~25 lines of bot-run.ts changed after it and were covered only by round-5 interrogate (3 seats).
  flaky: tests/lh-cli.test.ts 'exits 1 with one JSON line and no request on bad input' failed once with write EPIPE in the full check after the 08 merge (load ~10.5 on 4 cores); 10/10 pass in isolation. Test-helper race from 03 (unhandled stdin EPIPE), not 08. Kept the merge; 06 fixed the helper (ignores EPIPE); full check after the 06 merge passed it.
waiting on Matt: none
next: 07 running alone; nothing else launchable (09 verify phase B follows 07). 07 also carries 06's two deferred cursor gaps. Ticket branches push to origin at every handoff; do not push feat/external-teacher or main until Matt says "ship it".
