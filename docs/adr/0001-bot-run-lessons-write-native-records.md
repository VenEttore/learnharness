# Bot-run lessons write LearnHarness's own records from outside

Status: accepted

This fork lets an outside agent, a Bot Teacher, run a lesson in place of LearnHarness's own model. We decided that the Bot Teacher writes the same records LearnHarness's model writes: assistant text and the same question, `probe_done` and `plan_init` tool calls with their results and markers. It writes them through new HTTP routes, never data files. A per-lesson flag (`driver: "external"`) makes LearnHarness skip its model for that lesson. We chose this so the existing page, question dock, Skip, phase display and plan map work on bot-run lessons with only small upstream edits. That keeps merges from upstream cheap.

## Considered Options

- **A separate bot-lesson format and page.** Rejected: it duplicates the lesson UI, and the page would drift from upstream with every merge.
- **Bots write the data files directly.** Rejected: LearnHarness's process would no longer be the only writer, and its page would not hear about the changes.
- **Flatten bot turns to plain text.** Rejected: the dock, Skip, the phase display and the plan map all read tool calls.

## Consequences

- The bot routes must produce the exact shapes the page reads. That means real tool results joined to their calls by id, plan-block and handoff markers, and question payloads that pass the same checks the tool boundary runs. If upstream changes those shapes, bot-run lessons break until the fork follows.
- In bot-run lessons, the page must not act on records it would normally answer with a model turn. Its automatic `continue` and its API-key checks are switched off by the flag.
