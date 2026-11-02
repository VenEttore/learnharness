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
- [x] A failing test first that reproduces the corruption with the repro strings, through the same path the bench took (a bot-run quiz and probe, then the page's answer).
- [x] Fix the cause so details.questionText, options[].label, explanation and the recorded answer label equal the authored strings.
- [x] Say in Comments whether ordinary (LearnHarness model) lessons were affected too, and cover that in a test if so.
- [x] Mixed labels (plain text plus math) and `$$...$$` in a lead-in round-trip unchanged.

## Comments

### Stopped at the review cap 2026-11-02 (8 of 8 rounds; Status stays claimed)
Cause: not a `String.replace`. On the bench the learner answered on a phone, so the bot hand-built `POST /api/chat` answer requests inside double-quoted bash strings. Bash expanded the unset `$n` and `$k` to nothing, and the server stored the request's copy of the question text, option labels and explanation as sent. The question call's arguments kept the authored text. The page's own answers never had the problem.

Completed:
- `src/core/answer-authored-text.ts` (new) runs in `inputAppends` and `dismissAppends` (`src/core/input-events.ts`, 3-line upstream edit). Question text, quiz explanation and explain commitment come from the call. Answers use the parsed call, as the dock does; skips use the raw question, as the page does.
- Rows and picks change only in page-shaped requests: one row per option, indexed 1..n, with picks pointing at those rows. A row gets an option's label only when its own content names exactly one option that no other row claims. That content is a pick's value or its label, compared trimmed, in one of three forms: as authored; `$name`s removed with backslashes kept; `$name`s removed with JSON escapes decoded. One elimination pass settles a row whose label fits several options, ruling out only options bound to other rows. Anything ambiguous, malformed, or holding a shell form the guard does not model (`$*`, `$@`, `$#`, `$?`, `$$`, `$!`, `$-`, `$0`, bare `$_`, `${`, `$(`, `$[`, backtick) stays as sent. Matching cost is linear in the options.
- Ordinary (LearnHarness model) lessons go through the same answer path, so the fix covers them too. The page itself never mangled text, but a hand-built request to an ordinary lesson would have stored mangled labels, and those reach the model. Tests cover ordinary lessons through `inputAppends`.
- `tests/answer-authored-text.test.ts`: 35 tests. The bench repro goes through the bot-run probe route and the page's answer route, and again through real bash. Also covered: a teach quiz, recall, skips, ordinary lessons, mixed labels, a `$$` lead-in, order cases, malformed requests, both bash escaping styles, and timing bounds.

Verified (at bb28bcb): `npm run typecheck` and `npm run lint` clean. Full check 3126/3127; the one failure is the baseline Pi main-loader test. `NODE_ENV=test npx tsx --test tests/answer-authored-text.test.ts` 35/35. Before the fix, 22 of those tests fail on 870bb1a (code-review round 8 ran it). Blast-radius skipped: Risk pre-release.

Open Act On (round 8, each confirmed by rerunning the seat's repro at bb28bcb):
1. A backslash before a newline in an option's text (code-review round 8). With options `x\` + newline + `y` and `x\\ny`, the learner's pick of the first, sent through bash, arrives as `x\ny`. That is the second option's decoded form, so the pick is stored with the second option's label. Fix in the settled direction: add a backslash before a control character to `UNMODELED`, so rows and picks stay as sent.
2. A variable set in the bot's shell (interrogate round 8, seats A and C). The guard treats every `$name` as unset. With `m=2` set, a pick of `$m$` arrives as `2$` and takes `2$n$`'s label. With `USER=matt`, a pick of option `Alice` (value `$USER`) arrives with value `matt` and takes option `Bob`'s label (value `matt`). A row case reproduces the same way. The guard cannot see the bot's environment, so the fix is a stricter ambiguity check (for example, a pick's value never overrides a row label that names a different option, or text containing `$name` is matched only when no other option's verbatim text equals its form). Ticket 21's `lh submit` removes the shell from the path entirely.
Not findings by Matt's settled decisions: other quoting or escaping forms left unrestored, ambiguous rows left as sent, and "mixed" requests whose pick indexes come from another order.

