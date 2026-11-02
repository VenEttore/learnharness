# 20: LaTeX survives question presentation

Status: claimed
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/core/answer-presentation.ts and whatever builds question presentation details (find it), new test files. Not docs/external-teacher.md (ticket 19 holds it).

From ticket 15's bench (P0). Repro, from lesson chat_mvxc52d6_582ae133 on the bench box: a `quiz` or `probe` whose question or option labels contain inline math.

- Authored: question `After $k$ halvings starting from $n$ items, about how many items remain?`, labels `$n/2^k$`, `$n-k$`, `$n/k$`.
- Stored in the toolResult `details` and the recorded answer label: question `After $ halvings starting from $ items, ...`, labels `/2^k$`, `-k$`, `/k$`; explanation also mangled (`~/2$`, `after $ steps`).
- The toolCall `arguments` keep the authored text. Grading still works (by index), but the guide tells the Bot Teacher to read picks by `label`, and any answer path that echoes presentation labels sends the mangled ones.

Looks like something treats `$n` / `$k` as a variable or a replacement pattern (e.g. a `String.replace` with a `$`-pattern in the replacement string, or a shell-style expansion). Find the cause before fixing.

**What to build:**
- [ ] A failing test first that reproduces the corruption with the repro strings, through the same path the bench took (a bot-run quiz and probe, then the page's answer).
- [ ] Fix the cause so details.questionText, options[].label, explanation and the recorded answer label equal the authored strings.
- [ ] Say in Comments whether ordinary (LearnHarness model) lessons were affected too, and cover that in a test if so.
- [ ] Mixed labels (plain text plus math) and `$$...$$` in a lead-in round-trip unchanged.
