# Knowledge graph for bot-run lessons: feasibility (research only)

2026-11-03. From the Watcher's investigation, asked for by Ven. No tickets yet; Ven may follow up.

## Findings (Watcher)

- The graph lives in data/graph/: nodes.jsonl (facts), chains.jsonl (facts that together imply another), and a coverage file (lesson messages already read). It holds no quiz results or mastery.
- Writes: runExtraction (src/agent/subagents/extraction.ts) runs an extractor model on teacher text, then an auditor model that searches the existing graph, then mergeFindings (src/core/graph.ts), plain code that is the only thing that writes the files.
- Bot-run lessons are cut off by ticket 08's driver check in extraction.ts, before the models-configured check. Their teacher text is ordinary and extractable.
- Upstream main (e69e852, 0.4.1) is 63 commits ahead of the fork's base; it tuned the extraction prompts and duplicate checker; record shapes and mergeFindings are unchanged.

## Options

- A (recommended): the bot does the extractor and auditor thinking; LearnHarness keeps writing. Reads: `lh extract-view`, `lh graph find|sessions|propositions`. Write: POST /api/external/chats/:id/findings, validated, then mergeFindings under the same lock. About 2-3 tickets and an ADR update. No keys.
- B: read-only `lh sessions` / `lh propositions` alone. Useless until the graph has data.
- C: a graph outside LearnHarness (today's next-lesson-plan.md and routine).
- D: a setting that allows keyed extraction on bot-run lessons. Breaks the no-keys goal.
- Bot-run practice sessions need new turn types: a larger, separate project.

## Parent's answers to the four design questions (proposed, for Ven)

1. ADR 0001 and "sole writer": yes. Reword to "the merger is the sole writer; its input comes from LearnHarness's model or a bot". The spec's no-model-call goal still holds: LearnHarness calls no model.
2. Tag bot-submitted findings: yes. A source tag costs little and is the only way to find and remove bot facts later, since the graph is shared with ordinary lessons.
3. When: at lesson close. One run per lesson keeps the bot's work out of the teaching turns (the latency ticket 26 just cut). The coverage file makes a rerun safe, so a missed close can be run later.
4. Merge upstream 0.4.1 first: yes, as its own ticket, worth doing anyway. Expect conflicts in the upstream files the fork edits (components/chat.tsx, components/question-dock.tsx, src/core/input-events.ts, src/store/chats.ts, src/agent/subagents/extraction.ts).

Open risk: bot extraction quality is unmeasured. Without keys there is no keyed extraction to compare against on the same lesson; a first bench would have Ven judge the facts a bot adds from one lesson before turning it on by default.
