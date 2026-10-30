updated: 2026-10-30
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin. No GitHub credentials on linuxdev: ticket branches are not pushed to GitHub; a branch committed in this repo counts as pushed for the handoff check until Matt adds GitHub access.
live:
touches-locked:
waiting on Matt: GitHub access on linuxdev (optional; needed before "ship it" can push from here)
next: run the check baseline (npm ci first), commit check-baseline.txt, launch 01 and 02
