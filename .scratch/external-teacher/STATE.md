updated: 2026-10-30
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin. No GitHub credentials on linuxdev: ticket branches are not pushed to GitHub; a branch committed in this repo counts as pushed for the handoff check until Matt adds GitHub access.
live:
touches-locked:
waiting on Matt: GitHub access on linuxdev (optional; needed before "ship it" can push from here)
next: baseline explorer node:delegated-task:command%3Amcp%3Ac44b857c-1bf3-4cae-977d-9bf3323ef477%3Adelegate-task%3Aexternal-teacher-baseline-1 running on the integration tip (npm ci, then the repo check). When it finishes, commit check-baseline.txt, then claim and launch 01 and 02.
