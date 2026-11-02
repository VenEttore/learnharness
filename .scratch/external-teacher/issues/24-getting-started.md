# 24: Getting started from one prompt

Status: open
Blocked by: none
Risk: pre-release
Gate: human (Ven's test bot runs the README prompt cold; then "ship it")
Host: linuxdev
Touches: README.md, docs/external-teacher.md

Matt (2026-11-02): people should start the fork by handing a Grok Bot one prompt, not by reading the guide. The bot, not the prompt, asks the learner whether they want phone-ready or VM control.

- [x] README: drop Status; add "Getting started" with the prompt; drop "Cursor cloud agent".
- [x] Guide: clone step in section 1; "Ask the learner first" (phone-ready or VM control) before creating the lesson.
- [ ] Cold-start test: Ven's test bot gets the README prompt in a fresh folder, on this branch, and reports what it tripped on.
- [ ] Fix what the test finds, then ship to main on "ship it".
- [ ] After ship: GitHub description and website link (Matt approved 2026-11-02).
