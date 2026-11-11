# Bot-run lessons write LearnHarness's own records from outside

Status: accepted

This fork lets an outside agent, a Bot Teacher, run a lesson in place of LearnHarness's own model. We decided that the Bot Teacher writes the same records LearnHarness's model writes: assistant text and the same question, `probe_done` and `plan_init` tool calls with their results and markers. It writes them through new HTTP routes, never data files. A per-lesson flag (`driver: "external"`) makes LearnHarness skip its model for that lesson. We chose this so the existing page, question dock, Skip, phase display and plan map work on bot-run lessons with only small upstream edits. That keeps merges from upstream cheap.

The same holds for the knowledge graph. The merger (`mergeFindings` in `src/core/graph.ts`) is the only writer of graph facts and chains; what it merges comes from LearnHarness's model or a bot. In a bot-run lesson the Bot Teacher does the extractor's and the auditor's thinking and sends the result to `POST /api/external/chats/:id/findings` (`lh findings`). LearnHarness checks it with the extractor's and the auditor's own schemas and rules, plus stricter checks of its own for a bot, then merges it under the same audit lock as its own extraction, and marks those messages read in the coverage file. LearnHarness still calls no model in a bot-run lesson. Every node and chain line a bot's findings add to `nodes.jsonl` and `chains.jsonl` (the graph data directory, `LEDGER_FILES` in `config.ts`) carries `"source": "external"`, so a later cleanup can find them. Coverage lines carry no tag; they name the lesson.

## Considered Options

- **A separate bot-lesson format and page.** Rejected: it duplicates the lesson UI, and the page would drift from upstream with every merge.
- **Bots write the data files directly.** Rejected: LearnHarness's process would no longer be the only writer, and its page would not hear about the changes.
- **Flatten bot turns to plain text.** Rejected: the dock, Skip, the phase display and the plan map all read tool calls.
- **Let a bot-run lesson call LearnHarness's extractor and auditor models.** Rejected: bot-run lessons need no API key, and that stays true.
- **Bots write graph lines directly.** Rejected for the reason bots never write data files: the merger keeps ids, provenance, coverage and chain simplification consistent.

## Consequences

- The bot routes must produce the exact shapes the page reads. That means real tool results joined to their calls by id, plan-block and handoff markers, and question payloads that pass the same checks the tool boundary runs. If upstream changes those shapes, bot-run lessons break until the fork follows.
- In bot-run lessons, the page must not act on records it would normally answer with a model turn. Its automatic `continue` and its API-key checks are switched off by the flag.
- Bot findings are only as good as the bot's extraction. Nothing measures that yet. The source tag finds every line a bot added, but removing those lines is not a full undo: the merger's chain simplification may already have dropped another lesson's chain because a bot chain made it redundant, and removing the bot's line does not bring that chain back.
