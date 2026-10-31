updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  09 external-teacher-09-verify-phase-b node:delegated-task:command%3Amcp%3A60d049ee-eea3-4ca9-b2c6-e887a9666300%3Adelegate-task%3Aexternal-teacher-09-1 (worktree from handoff) running
touches-locked: 09 (Touches: unknown, locks everything)
merged: 02 (33e1e55), 01 (0400540), 04 (8d77b94), 03 (e51624e), 05 (phase A verified; .scratch only), 08 (2e93d6c), 06 (8247cca), 07 (5929722); check after each code merge matches baseline
notes: 03 round 5 code-review did not run (Grok 4.7 provider error twice, no substitute); last code-review was round 4 on a6b7044, ~25 lines of bot-run.ts changed after it and were covered only by round-5 interrogate (3 seats).
  flaky: tests/lh-cli.test.ts 'exits 1 with one JSON line and no request on bad input' failed once with write EPIPE in the full check after the 08 merge (load ~10.5 on 4 cores); 10/10 pass in isolation. Test-helper race from 03 (unhandled stdin EPIPE), not 08. Kept the merge; 06 fixed the helper (ignores EPIPE); full check after the 06 merge passed it.
spec-review: 07 changed check 4 to read past max(after, bot's last message) and added items to show and create replies; side effect: a second writer whose after is older than input another bot message followed is accepted, so the spec's Out of Scope line "the cursor already refuses a writer that missed learner input" holds only for input after the bot's last message. Raise at the final spec review.
models: code-review runs on claudeAgent | claude-opus-5-5 | effort=xhigh, fastMode=false (Matt, 2026-10-31; models.md updated). Say so in every brief.
waiting on Matt: none
next: 09 running alone. Then 10 and 13 are on the frontier together. Ticket branches push to origin at every handoff; do not push feat/external-teacher or main until Matt says "ship it".
