# 20: LaTeX survives question presentation

Status: resolved
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

### Shipped 2026-11-02 (bench 2 follow-up, Ven via the Watcher)
Completed:
- B2 from bench 2 (Ven's test bot on external-teacher-bench-2): with USER=matt in the bot's shell, option Alice's value `$USER` arrived as option Bob's value `matt`, and the server stored the learner's pick of Alice as Bob, under both shell forms. Now a pick's sent label outranks its value when the label names options in any modeled form and the value's option is not among them: the pick stays as sent, and its value does not bind its row. When the label also names the value's option, the value still restores as before. The same check guards a pick's fallback to its row's option.
- Review of the B2 fix (one round: code-review, interrogate seats A and C) found that the first, exact-label version blocked restorations the earlier guard made (a modeled form that equals another option's authored label: `2$n$` -> `2$`, `cost: $5` -> `cost: `, `$x$` -> `$`) and went quadratic on multi-select answers. The final rule above fixes both: lookups use the prebuilt index, so cost is linear again.
- Integration tip 8b50b11 merged in (7598b14), clean.
- Everything from the earlier entry: the guard in `src/core/answer-authored-text.ts`, wired into `inputAppends` and `dismissAppends` (`src/core/input-events.ts`); ordinary (LearnHarness model) lessons are covered by the same path and tested.

Known limits (not fixed; ticket 21 puts the "never double-quoted" rule and these limits in the guide):
- A (backslash before a newline): an option whose text has a backslash right before a newline can arrive, through bash, in another option's decoded form, and a pick can then take that option's label.
- B1 (a set shell variable that makes one option's text another option's form): e.g. with m=2, a pick of `$m$` arrives as `2$` and can take `2$n$`'s label. The guard cannot see the bot's environment.
- Bench 2 found `--file`, a single-quoted heredoc and `curl --data-binary @file` clean in every bench-2 case. `$?`, `$$` and `$(...)` leftovers stay as sent by design (never worse), and odd requests O1-O19 were restored or stored as sent.

Deferred: to ticket 21 (`lh submit`, which sends picks by index with no shell in the path, and the guide's "never double-quoted" rule with limits A and B1).

Verified:
- `NODE_ENV=test npx tsx --test tests/answer-authored-text.test.ts`: 39/39. The B2 bench test fails on bb28bcb (stored Bob); the review-cases test fails on 19faf0f; both pass now.
- `npm run typecheck`, `npm run lint`: clean. Full check (`NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`, load under 12) at 3958658: 3151/3152; the one failure is the baseline Pi main-loader test. The ship commit adds only this ticket file.
- Review: code-review on claude-opus-5-5 xhigh (Standards PASS, Spec FAIL on the two points above, both fixed); interrogate seat A (Opus 5.5) and seat C (Haiku 5.5), each confirmed by its repros at 19faf0f. GLM 5.3 Flash and Composer 2.5 skipped (Cursor limit until 2026-11-19).
- Blast-radius skipped: Risk pre-release.

