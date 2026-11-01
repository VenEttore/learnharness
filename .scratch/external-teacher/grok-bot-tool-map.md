# LearnHarness tools vs Grok Bot tools

2026-11-01. From the guide's Method section (docs/external-teacher.md section 6), marked by the Agentic IDE Watcher (Grok Bot side). Ticket 21 folds this into the guide.

## Tools `lh` covers (the lesson record still goes through `lh`; this is the learner-facing side only)

| LearnHarness tool | `lh` command | Grok Bot stand-in | Mark |
|---|---|---|---|
| `send_to_user` / plain text | `lh say` | Markdown in chat; convert single-`$` math to `\( \)` | equivalent |
| `ask_user_question` | `lh ask` | Chat widget (options and/or free text); main chat agent only | equivalent |
| `probe` | `lh probe` | Widget with pick + confidence + thinking; show options in the order `lh` stored them; "I don't know" is an extra widget option | partial |
| `recall` | `lh recall` | Free-text widget field | equivalent |
| `quiz` (teach) | `lh quiz` | Screenshot of `/chat/<id>/card` (ticket 22), then a widget | partial |
| `explain` (teach) | `lh explain` | Free-text widget field | equivalent |
| `probe_done` | `lh probe-done` | none needed | n/a |
| `plan_init` | `lh plan` | `flowchart TD` mermaid in chat with short labels; card screenshot as fallback | partial (display only) |

## Tools `lh` lacks

| LearnHarness tool | Grok Bot stand-in | Mark |
|---|---|---|
| `research` | Web search/fetch, background subagents | equivalent |
| `demo` | Screenshots (one, or a short sequence at key states) plus a widget; true interactivity only through desktop Take over | partial |
| `visual` | Mermaid in chat, or a rendered HTML/SVG screenshot for anything exact; generated images are illustrations only | equivalent |
| `pdf` | poppler-utils on the box; files can be copied to the box from Ven's computers (per-action approval) or Gmail/Drive attachments | equivalent |
| `find`, `ls`, `grep`, `read` | Shell on the box; Ven's own computers need approval per command, so copy notes to the box first | equivalent on the box, partial on Ven's machines |
| `list_sessions`, `list_propositions` | Durable memory (free-text facts, no structured graph) | partial |
| background jobs | Subagents; they cannot raise widgets or talk to Ven, results return to the main agent | equivalent |
| practice / spaced review | Routines wake the main agent, which asks by widget; no scheduling algorithm, so interval logic would live in `lh` or the guide | partial |

## Stays in LearnHarness

Lesson state machine and phase gates, one open question, the cursor, lesson records on disk, grading and confidence in the lesson's format, option shuffle, "I don't know" semantics, plan node ids.

## Re-bench check added

Mermaid plan map (10-15 nodes, `flowchart TD`, short labels) readable in Grok Bot chat on Ven's phone; if cramped, use the card page's plan view screenshot.

## Possible follow-ups (not tickets)

- `lh sessions` / `lh propositions`: read-only access to earlier lessons. Only useful if bot-run lessons feed the graph, which ticket 08 blocks on purpose.
- Spaced review scheduling in `lh` (routines would call it).
