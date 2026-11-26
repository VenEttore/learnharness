# 34: Survey upstream 0.7.0 before catching up

Status: open
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: .scratch/external-teacher/upstream-0.7.0-survey.md only (read-only otherwise; a trial merge runs in a scratch worktree and is never committed or pushed)

Matt (2026-11-26): look at the other upstream changes so the fork can catch up. Last upstream merge: ticket 27 took 0.4.1 (5b6bff7). upstream/main is at v0.7.0 plus a few commits (e3cfff6e at survey time), 389 commits past it.

Output: one report, .scratch/external-teacher/upstream-0.7.0-survey.md, that Matt can decide from.

- [ ] What changed upstream between our last merge and upstream/main, grouped by area (lesson flow, teacher prompts and extraction, knowledge graph, question card, chat page, settings and model providers, desktop app, build and dependencies). Use release notes or CHANGELOG if upstream has them, then the git log. One plain line per change that matters to a learner or to this fork; skip pure refactors unless they move files the fork edits.
- [ ] Overlap with the fork: list upstream changes to files the fork edits or depends on. The fork's own files and edits are `git diff <merge-base with upstream/main>..feat/external-teacher` (bot-run lessons, external routes, `lh`, graph reads and findings, guide). Call out anything that changes what bot-run lessons rely on: turn records (ADR 0001), question kinds and `displayedQuestionOptions`, extraction (`EXTRACTOR_INSTRUCTIONS`, `mergeFindings`, `sessionFindingsSchema`), graph ledgers and `graphDataRevision`, the lesson page's auto-wake.
- [ ] Trial merge: in a scratch worktree from feat/external-teacher, `git merge --no-commit upstream/main`. List each conflicted file with a one-line reason. Then abort and remove the worktree. Do not resolve, commit or push anything.
- [ ] A recommendation: one merge (like 27) or steps (for example by release tag 0.5.0, 0.6.x, 0.7.0), with the risky spots and what a bench after the merge should check.

## Comments
