updated: 2026-10-30
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin. No GitHub credentials on linuxdev: ticket branches are not pushed to GitHub; a branch committed in this repo counts as pushed for the handoff check until Matt adds GitHub access.
live:
  01 external-teacher-01-shared-tool-helpers node:delegated-task:command%3Amcp%3Ac44b857c-1bf3-4cae-977d-9bf3323ef477%3Adelegate-task%3Aexternal-teacher-01-1 /home/matt/.t3/worktrees/learnharness/t3-4ef9bc38 running
  02 external-teacher-02-page-input-without-model node:delegated-task:command%3Amcp%3Ac44b857c-1bf3-4cae-977d-9bf3323ef477%3Adelegate-task%3Aexternal-teacher-02-1 /home/matt/.t3/worktrees/learnharness/t3-dc6664d5 running
touches-locked: 01, 02
waiting on Matt: GitHub access on linuxdev (optional; needed before "ship it" can push from here)
next: both slots are full. On a handoff, validate it, merge or relaunch, then launch the next frontier ticket if a slot is free.
