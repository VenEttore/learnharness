# 13: Teacher guide

Status: resolved
Blocked by: 09
Risk: pre-release
Gate: none
Host: linuxdev
Touches: docs/external-teacher.md (new)

Phase C. Written from the spec's command contract, in parallel with tickets 10–12.

**What to build:** A short guide that lets a Grok Bot start LearnHarness on the bot computer and run a full lesson with `lh`, without reading LearnHarness's code.

- [x] Starting LearnHarness:
  - Node 22, listening on 127.0.0.1;
  - browser mode, so neither `LH_DESKTOP_SERVER` nor `LH_DESKTOP_API_SECRET` is set;
  - `LH_DATA_DIR` under `/workspace`, and no API keys;
  - how to check it's up;
  - how to run `lh`.
- [x] Running a lesson:
  - the commands per phase, with JSON examples and how to pass the cursor along;
  - the first teaching question goes out while `lh show` still says `plan`, after the learner accepts the plan;
  - the takeover flow: the bot is paused; on resume, run `lh answer` once, and use `--wait` only for answers outside a takeover;
  - reading answers and skips, and grading free recall in the next `say`;
  - only the Teacher writes, and its workers report back.
- [x] Method:
  - names LearnHarness's prompt files;
  - maps tool names to `lh` commands (`send_to_user` → `lh say`, `ask_user_question` → `lh ask`, `plan_init` → `lh plan`, and the rest);
  - lists the tools `lh` lacks: research, demos, visuals, pdf, `find`, `ls`, `grep`, `read`, `list_sessions`, `list_propositions`.
- [x] Every `lh` command and flag in the guide matches the spec's command contract. Every mapped tool name exists in LearnHarness's tools or prompt files.
- [x] The JSON examples are written to run as-is (ticket 14 runs them).

## Comments

### Shipped 2026-10-31
Completed:
- docs/external-teacher.md: the Bot Teacher guide. It covers starting LearnHarness on 127.0.0.1 in browser mode with no keys, how `lh` replies (exit codes, cursor, items, input), running a lesson phase by phase with JSON examples, reading answers, skips and takeovers, refusals and recovery, and the Method section that maps tools to `lh` commands.
- Round 3 fixes: the sentence about continuing an earlier Bot Teacher's lesson, the duplicate "one writer" line, step 4 and step 5 now agree on proving the server is yours, the grep in step 5 is an instruction, the items sentence names its subject, and a bare plan id takes its id as its title.
Deferred:
- GLOSSARY.md entries for cursor, turn, item, repeat and takeover go to the follow-up glossary ticket. That ticket should also add "strand" and "refusal".
- Three Standards judgement-call wording nits from the round 3 recheck were not applied (line 14 "confirms" vs "checks", line 32 appositive, line 230 "creates the lesson"). They do not block; dropped unless the glossary ticket picks them up.
- Code paths with no test (not guide bugs): `bad_reply`, the "did not answer" case of exit 3, a failed save on `lh lesson new`, and an `unread_input` whose `--after` is newer than the last turn. Seats checked all four by hand.
Verified:
- Code-review round 3: Spec passed at b058d78. Standards failed on prose, the fixes went into d3a9c76, and the recheck passed.
- Interrogate round 3 at d3a9c76, four seats: Opus 5.5 walked the whole lesson, every JSON example in order, against a real server, including the takeover, a lost reply, and every refusal and exit code. GLM 5.3 Flash checked sections 2, 4 and 5, Haiku 5.5 checked sections 3 and 6, and Composer 2.5 checked section 1, takeover and the exit table. None found anything. Act On: none.
- Repo check after merging feat/external-teacher (ed38b37): `npm run typecheck` and `npm run lint` pass. Tests: 3085 of 3086 pass, run with `--test-concurrency=2`. The one failure is the baseline test "main loader resolves Pi's import-only PUBLIC package exports…".
- Blast-radius: skipped, because this ticket is Risk: pre-release and docs-only.
