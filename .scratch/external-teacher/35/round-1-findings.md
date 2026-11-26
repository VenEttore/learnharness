# Ticket 35, review round 1 findings

Reviewed SHA: fa29bc7d (the merge 52b07e6b plus the round brief). Scope: `git diff feat/external-teacher...fa29bc7d`.

## Seats

| Seat | Model | Result |
|---|---|---|
| code-review Standards | claudeAgent Opus 5.5, effort xhigh (project override) | 0 hard violations, 2 judgement calls |
| code-review Spec | claudeAgent Opus 5.5, effort xhigh (project override) | 2 findings, both missing ticket records |
| interrogate A | claudeAgent Opus 5.5, effort xhigh (project override) | Findings: 0 |
| interrogate B | opencode `opencode-go/deepseek-v4.1-flash`, variant high (models.md primary) | Findings: 0 |
| interrogate C | claudeAgent Haiku 5.5, effort xhigh | Findings: 0 |
| interrogate D | cursor Composer 2.5 failed to start twice ("Cursor Agent SDK worker.register failed"); ran on its fallback, claudeAgent Sonnet 5.5, effort high | Findings: 0 |

Seat B follows the current `~/.agents/models.md` line (OpenCode Go primary, Cursor fallback). The launch brief named Cursor first and OpenRouter as the fallback, but OpenRouter has been disconnected since 2026-11-25.

## Findings and dispositions

1. Standards, judgement call: the `writeChat` docstring credited upstream's atomic writer to the fork and repeated atomic-write.ts's note. **Fixed** in 1962bfb2: the docstring is back to upstream's text, and the D2 comment inside `writeChat` stays. (mechanism: fork-comment-credits-upstream)
2. Standards, judgement call: `tests/chat-atomic-write.test.ts` (fork, ticket 16) and upstream's `tests/store-writes-atomic.test.ts` chat case check the same promise. **Declined**: the fork test also covers an ENOSPC failure partway through the write, which upstream's test does not.
3. Spec: the conflict choices, the record-format answer and the guide answer were not recorded in the ticket. **Fixed** in the ticket's Shipped comment.
4. Spec: the search for new model-call paths was not recorded. **Fixed** in the ticket's Shipped comment. The search found no new path a bot-run lesson can reach. Seat C's 15-test probe and seat D's end-to-end lesson drive back that up.

## Observations, not findings (both older than this merge)

- C: the page sends `retry-question` with no `botRun` check (`components/chat.tsx:1604`). The server accepts it for a bot-run lesson and appends a tool result. No model runs. Ticket 27 deferred the same thing. **Deferred**: Matt decides (ticket item).
- C: `recoverStaleJobs` (`src/server/jobs.ts:736`) respawns any running job row without a driver check. No route writes a job row for a bot-run lesson. **Deferred**.
