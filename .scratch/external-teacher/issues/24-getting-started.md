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
- [x] From Ven during the cold-start (2026-11-02): phone-ready asks in chat text and a widget; a card screenshot only when the question has something chat can't show (diagram, table, laid-out code). The bot still opens the card to read the option order. The widget's free-text input (`allowCustom`) takes pick and reasoning in one place; reasoning may also come as a chat message. Not yet run by a bot: the cold-start tested 29b02a8, before this change.
