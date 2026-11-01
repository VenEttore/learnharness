# LearnHarness tools vs Grok Bot tools

Draft 2026-11-01 from the guide's Method section (docs/external-teacher.md section 6) and the Watcher's capability notes. Status column: equivalent / partial / none. "Watcher" column waits for the Watcher's confirmation.

## Tools `lh` already covers (the lesson record must go through `lh`)

| LearnHarness tool | `lh` command | Grok Bot stand-in for the learner-facing side | Status | Watcher |
|---|---|---|---|---|
| `send_to_user` / plain text | `lh say` | Markdown in chat (math as `\( \)`, `$$ $$`) | partial: display only; the lesson record still needs `lh say` | |
| `ask_user_question` | `lh ask` | Chat widget (options + free text) | equivalent UI; save with `lh submit` (ticket 21) | |
| `probe` | `lh probe` | Chat widget: pick + confidence + thinking | partial: option shuffle and "I don't know" semantics live in LearnHarness | |
| `recall` | `lh recall` | Chat widget, free text | equivalent UI | |
| `quiz` (teach) | `lh quiz` | Chat widget, or a screenshot of `/chat/<id>/card` (ticket 22) plus a widget | partial: plan node tags and grading live in LearnHarness | |
| `explain` (teach) | `lh explain` | Chat widget, free text | equivalent UI | |
| `probe_done` | `lh probe-done` | none needed (no learner-facing side) | n/a | |
| `plan_init` | `lh plan` | Fenced `mermaid` in chat | partial: display only; node ids live in LearnHarness | |

## Tools `lh` lacks

| LearnHarness tool | What it does | Grok Bot stand-in | Status | Watcher |
|---|---|---|---|---|
| `research` | background research job | Web search/fetch, subagents | equivalent | |
| `demo` | interactive HTML demonstration | Build an HTML page on the box and screenshot it; Canvas pages are not interactive | partial | |
| `visual` | diagram or visual explanation | Image generation; mermaid in chat | equivalent? | |
| `pdf` | read a PDF | Shell tools on the box (e.g. pdftotext), browser | equivalent if the file is on the box | |
| `find`, `ls`, `grep`, `read` | read the learner's imported files | Shell on the box | equivalent if the files are on the box | |
| `list_sessions` | see earlier lessons | Durable memory (free text) | partial | |
| `list_propositions` | read the knowledge graph | Durable memory (free text) | partial; note bot-run lessons add nothing to the graph (ticket 08 blocks extraction) | |
| background jobs | long work while the lesson continues | Subagents; routines | equivalent | |
| practice sessions / spaced review | later review | Routines that wake the main agent | partial | |

## Stays in LearnHarness (no Grok Bot equivalent)

Lesson state machine and phase gates, one open question, the cursor, lesson records on disk, grading and confidence in the lesson's format, option shuffle, "I don't know", plan node ids.

## Possible follow-ups (not tickets yet)

- `lh sessions` / `lh propositions`: read-only commands over LearnHarness's own store, so a Bot Teacher can see earlier lessons. Only useful if bot-run lessons feed the graph, which ticket 08 blocks on purpose (extraction calls a model).
