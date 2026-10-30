updated: 2026-10-30
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin. No GitHub credentials on linuxdev: ticket branches are not pushed to GitHub; a branch committed in this repo counts as pushed for the handoff check until Matt adds GitHub access.
live:
  01 external-teacher-01-shared-tool-helpers launching launching running
  02 external-teacher-02-page-input-without-model launching launching running
touches-locked: 01, 02
waiting on Matt: GitHub access on linuxdev (optional; needed before "ship it" can push from here)
next: worktrees cut from the claim commit; write the task ids into live once both launches return
