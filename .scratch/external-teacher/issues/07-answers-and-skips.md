# 07: Reading answers and skips

Status: claimed
Blocked by: 06
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, app/api/external/chats/[id]/answer, scripts/lh.mjs, app/api/chats/[id]/dismiss/route.ts, new test files

Phase B.

**What to build:** `lh answer` returns everything the page recorded for each answer and skip, `--wait` waits for learner input, and a skip refreshes the sidebar.

Answer item fields. Sources are the tool-result message and the stored answer data on its details:

| Field | Source |
|---|---|
| `type` | `"answer"` |
| `id` | the tool-result message id |
| `toolCallId` | the tool result's call id |
| `kind` | the stored answer kind |
| `question` | stored `questionText` |
| `answers` | the picks, as `{ index, label }` |
| `dontKnow` | stored `dontKnow` |
| `text` | stored `text` |
| `other` | stored `other` |
| `thinking` | stored `thinking`, else stored `note` |
| `readingThinking` | stored `readingThinking` |
| `confidence` | stored `confidence` |
| `correct` | stored `correct` |

Check every source name against the stored answer type before using it.

- [ ] Answer items follow the table. A dismissed result becomes `{ type: "skip", id, toolCallId, kind }`. The bot's own tool results and markers are excluded.
- [ ] An answer saved through the page's send route (ticket 02) comes back as an item with every field it carried.
- [ ] `lh answer --wait` checks every 2 s until there is at least one item, for 10 minutes by default (`--timeout` changes it). On timeout it prints `{ ok: false, error: "timeout" }` and exits 2.
- [ ] The dismiss route emits `chats-changed` for every lesson. Tests cover an ordinary lesson and a bot-run lesson.
