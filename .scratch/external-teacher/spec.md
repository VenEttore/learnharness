Status: open

# Bot-run lessons, round 1: the lesson loop

## Problem Statement

LearnHarness teaches only through its own models, which need API keys and bill per call. The owner already pays for Grok Bots (Cursor cloud agents) and wants them to act as the models instead. All of the owner's Grok Bots share one cloud computer with shared files, a terminal and a browser, and `/workspace` persists. Today a bot there cannot run a lesson. LearnHarness has no way to accept turns from outside. The page sends anything the learner types to LearnHarness's own model, or refuses it when no key is set. And the page wakes the model by itself after every answer.

## Solution

A Bot Teacher (a Grok Bot) runs a whole lesson, probe then plan then teach, through a small `lh` command on the shared computer. `lh` calls new LearnHarness HTTP routes. Each lesson the bot creates is a bot-run lesson. For those lessons, LearnHarness saves learner input and never calls a model. The bot's turns are stored in the same records LearnHarness's own model writes (see ADR 0001), so the existing page shows them unchanged: the question dock, Skip, the phase display and the plan map.

The owner answers on the normal page by taking over the bot's browser with Cursor's "Take over", then clicks Cursor's "I'm done". The bot reads the learner input with `lh answer`. A short guide tells the bot how to start LearnHarness and how to run a lesson, and points it at LearnHarness's own teaching prompts for method.

The work comes in four phases:
- **Phase A, Talk.** A bot can create a lesson, say things, and read what the learner types.
- **Phase B, Probe.** A bot can ask probe questions and read answers and skips, and no model path remains in a bot-run lesson.
- **Phase C, Plan and teach.** A bot can finish the probe, post a plan, and teach with tagged questions. A scripted no-key lesson runs end to end.
- **Phase D, Bench.** A Grok Bot runs one full lesson with the owner on the bot computer.

## User Stories

1. As the owner, I want a Grok Bot to run a whole LearnHarness lesson, so that I learn without paying for LearnHarness's model calls.
2. As the owner, I want LearnHarness to make no model call in a bot-run lesson by any path, so that nothing is billed to an API key and nothing fails for lack of one.
3. As the owner, I want LearnHarness to work on the bot computer with no API keys configured, so that setup is just installing and starting it.
4. As a Bot Teacher, I want to create a lesson with a title, so that the owner can find it in the sidebar.
5. As a Bot Teacher, I want lesson creation to take a key that returns the same lesson on a rerun, so that a retried command never leaves a duplicate lesson.
6. As a Bot Teacher, I want to store the owner's request as the lesson's first message, so that the probe starts from a stated goal and the lesson records what was asked.
7. As a Bot Teacher, I want to post plain teaching text, so that I can explain, give feedback and grade free recall.
8. As a Bot Teacher, I want to ask an open question or offer options, in any phase, so that I can find the learner's goal or check what they want.
9. As a Bot Teacher, I want to post a multiple-choice probe question, so that I can measure what the learner already knows.
10. As a Bot Teacher, I want to post a free-recall probe question, so that I can hear the learner explain in their own words.
11. As a Bot Teacher, I want to put lead-in text in the same message as a question, so that the page shows them together the way LearnHarness's model does.
12. As a Bot Teacher, I want to finish the probe with an assessment of each strand, so that the lesson moves to the plan phase the same way it does for LearnHarness's model.
13. As a Bot Teacher, I want finishing the probe to wake nothing, so that I carry on as the teacher in the same lesson.
14. As a Bot Teacher, I want to post the lesson plan as a Mermaid diagram, so that the owner sees the plan map.
15. As a Bot Teacher, I want a broken plan refused with the parser's error, so that I can fix it before anything is saved.
16. As a Bot Teacher, I want to rewrite the plan mid-lesson, so that I can correct the map, as LearnHarness's model can.
17. As a Bot Teacher, I want to post predict and check questions tagged with a plan node, so that the page shows teaching progress on the map.
18. As a Bot Teacher, I want to post a tagged free-recall teaching question, so that the learner can explain a concept in their own words.
19. As a Bot Teacher, I want every question checked by the same rules LearnHarness's model faces, so that I never post a question the page cannot show or grade.
20. As a Bot Teacher, I want a refusal to say exactly what is wrong, so that I can fix the turn and resend it.
21. As a Bot Teacher, I want a turn refused while a question is still open, so that I never talk over a question the learner hasn't answered.
22. As a Bot Teacher, I want a turn refused if it doesn't fit the lesson's phase, with the kinds allowed now, so that the phase display and the plan map stay correct.
23. As a Bot Teacher, I want a turn refused if the learner added input I haven't read, with that input in the refusal, so that I never miss a message.
24. As a Bot Teacher, I want rerunning a turn I already posted to return success and save nothing, so that a lost reply never duplicates a turn.
25. As a Bot Teacher, I want a re-asked question saved when the learner has answered or skipped since, so that re-asking after a skip works.
26. As a Bot Teacher, I want every command to return a cursor, so that I can pass it back with my next turn.
27. As a Bot Teacher, I want to read all learner input since my last turn, in order, so that I respond to everything.
28. As a Bot Teacher, I want each answer with everything the page recorded (picks, correctness, confidence, "I don't know", free text, "Other" text, and the learner's reasoning), so that I can grade and respond properly.
29. As a Bot Teacher, I want skips reported as skips, so that I can decide whether to re-ask or move on.
30. As a Bot Teacher, I want reading learner input to be safe to repeat, so that a retry never loses input.
31. As a Bot Teacher, I want to wait for learner input with a timeout that does not look like success, so that I never act as if the learner answered when they didn't.
32. As a Bot Teacher, I want to read the whole lesson back (phase, plan, open question, every turn and all learner input), so that I can resume after losing my memory, or take a lesson over from another bot.
33. As a Bot Teacher, I want `lh` to say clearly when LearnHarness isn't running, and point me at how to start it, so that I can recover on my own.
34. As a Bot Teacher, I want one JSON line per command and distinct exit codes, so that I can script my loop.
35. As a Bot Teacher, I want a short guide to the commands per phase, with JSON examples, so that I can run a lesson without reading LearnHarness's code.
36. As a Bot Teacher, I want the guide to map LearnHarness's tool names to `lh` commands and list the tools I don't have, so that I can use the original teaching prompts as method.
37. As a Bot Teacher, I want the guide to say the first teaching question goes out while the phase still reads "plan", so that teaching starts.
38. As a Bot Teacher, I want the guide to explain the takeover flow, so that I read learner input once each time I resume.
39. As a Bot Teacher, I want the guide to say only I write to the lesson and my workers report back to me, so that turns stay in order.
40. As the owner, I want to type a message in a bot-run lesson with no API key set and have it saved, so that I can reply to the plan and ask questions.
41. As the owner, I want answering a question in a bot-run lesson to save my answer and not start LearnHarness's model, so that no error banner or spinner appears.
42. As the owner, I want reloading a bot-run lesson to show no error and send no request on its own, so that the page stays calm while the bot works.
43. As the owner, I want Skip to work in bot-run lessons, so that I can pass on a question.
44. As the owner, I want the sidebar to update as the bot writes and as I answer or skip, so that phase and "question waiting" stay current.
45. As the owner, I want no "add a key" prompt in a bot-run lesson, so that the page doesn't push setup I don't need.
46. As the owner, I want the plan map and the in-lesson plan block to appear when the bot posts a plan, so that I can see the path.
47. As the owner, I want the phase display to move from probe to plan to teach as the bot works, so that I know where the lesson stands.
48. As the owner, I want the manual knowledge-graph extract button to do nothing in a bot-run lesson, so that it never calls a model.
49. As the owner, I want lessons on the bot computer kept under `/workspace`, so that they survive when the computer restarts.
50. As the owner, I want LearnHarness on the bot computer to accept connections only from that computer, so that nothing outside can reach its open API.
51. As the owner, I want ordinary lessons to behave exactly as before, so that the fork doesn't break LearnHarness.
52. As the owner, I want upstream edits kept small and listed, so that merging upstream updates stays easy.

## Implementation Decisions

- **Bot-run flag.** The lesson record gains an optional `driver: "external"` and an optional `externalKey`. Lesson creation in the chat store takes an optional third argument to set them; existing callers stay untouched. Lessons without the flag behave as today.
- **Bot-run module.** A new server module holds all bot-run logic. Routes are thin wrappers that import it through the server barrel, following the repo's import rule.
- **Page input in a bot-run lesson.** The chat handler gets one early return, right after it fetches the record and parses the input, into the bot-run module. That path:
  - accepts only the page's input types (any other input, such as an internal wake input, is refused with 400 and code `bot_run_lesson`);
  - refuses `continue` and `retry` with 422 and code `bot_run_lesson` (not 409, which the page treats as "turn running" and resends);
  - otherwise appends the input with the existing input-append logic, turning its errors into 400;
  - commits the record and returns the same settled-turn response the parallel-question path returns.

  It runs no model or key gate, no compaction and no turn start. From reading the record to writing it, there is no await.
- **One commit helper.** Every bot-run write goes through one helper that saves the messages and emits both `record-changed` and `chats-changed`. The store's "saves stay silent" comment names this exception: bot writes have no turn events to refresh the sidebar.
- **Skip.** The existing dismiss route also emits `chats-changed`, for every lesson. A skip changes the sidebar's question-waiting state and has no turn event to carry it.
- **Page client.** The lesson page passes a `botRun` value from the record, through the chat view and the session hook, into the session model. That one value:
  - stops the automatic `continue` (`continueIfOwed`);
  - skips the no-key and model-unavailable checks before sending;
  - hides the "add a key" prompt.

  Changes stay a few lines each.
- **Other model paths.** The extraction pipeline returns an empty result for a bot-run lesson, before its "models not configured" check. That covers the manual extract button and automatic triggers. Compaction runs only through the chat handler, which the early return skips. The background job sweep covers every lesson, and with no keys it cannot call a model.
- **Turn kinds.** One table in the bot-run module defines, for each kind: the tool name, the phases it is allowed in, the schema, the refinement check, whether it needs a plan node, and how its records are built.

  | kind | allowed in | records |
  |---|---|---|
  | `say` | any phase | assistant text |
  | `ask` | any phase | `ask_user_question` call |
  | `probe` | probe | `probe` call |
  | `recall` | probe | `recall` call |
  | `probe-done` | probe | `probe_done` call, its tool result, then the handoff marker. Wakes nothing; never runs the tool's own code. |
  | `plan` | plan, teach | tree saved first; then `plan_init` call, its tool result carrying the tree, then plan-block markers, in one save |
  | `quiz` | plan, teach | tagged `quiz` call |
  | `explain` | plan, teach | tagged `explain` call |

  Question kinds take optional lead-in text in the same assistant message.
- **Validation.** Validation is the real tool boundary: the tool's TypeBox schema checked as pi checks it, then the tool's refinement, then the plan-node check. `plan` runs the Mermaid parser and tree builder. Problem text goes back to the bot.
- **Shared result builders.** The `probe_done` and `plan_init` tool results move out of the tool files into shared helpers that both the tools and the bot-run module call. The plan-node check the teaching tools run moves into the same shared place. The plan input schema and the plan reminder text get exported.
- **Record shapes.** Tool results are real tool-result messages joined to their call by id, with the same text and details the tools write. Markers come after the result. Bot assistant messages come from one constructor: block-array content, a record id, a normal stop reason, and placeholder provider, model and usage stamps, following the existing synthetic-stamps precedent.
- **Routes.**
  - **Create** takes `{ title, key, prompt? }` and returns `{ ok, id, title, existing, cursor }`. `key` is required. A lesson with the same key is returned instead of a new one; the lookup and the create run in one synchronous block. The title is shortened the same way the normal route shortens it. `prompt` becomes the first user message.
  - **Show** returns `{ ok, id, title, phase, plan, openQuestion, messages, cursor }`. `phase` comes from the existing phase fold. `plan` is the latest successful plan in the transcript, which is what the page draws. `messages` is a compact list that keeps each question's call id.
  - **Turn** takes `{ kind, after, ...payload }` and returns `{ ok, cursor }` or `{ ok, repeat: true, cursor }`. Checks run in this order, all before any write:
    1. the lesson exists and is bot-run;
    2. `after` names a message in the lesson;
    3. repeat: if a bot turn of the same kind and checked payload already follows `after`, return `repeat: true` and save nothing;
    4. unread input: if learner input follows `after`, refuse with code `unread_input`, the items, and the cursor;
    5. an open question exists: refuse;
    6. the kind isn't allowed in this phase: refuse, listing the kinds allowed now;
    7. validation fails: refuse with the problem text.

    Then build the records and commit. There is no await from read to write.
  - **Answer** returns `{ ok, items, openQuestion, cursor }`. Items are the learner input after the bot's last assistant message, in order. That list is complete because check 4 stops the bot from writing past input it hasn't read. Item types:
    - message: `{ type: "message", id, text }`
    - answer: `{ type: "answer", id, toolCallId, kind, question, answers, dontKnow, text, other, thinking, readingThinking, confidence, correct }`, copied from the stored answer data with the same field list the model-facing compact form uses
    - skip: `{ type: "skip", id, toolCallId, kind }`

    The bot's own results and markers are excluded. Reading twice returns the same items.
  - The **cursor** is the id of the newest message in the lesson.
- **`lh`.** One Node 22 script with no dependencies.
  - Base URL comes from `LH_URL`, default `http://127.0.0.1:3000`. Not `localhost`, which can resolve to the IPv6 address while the server listens on 127.0.0.1 only.
  - It prints one JSON line per command, with the cursor when there is one.
  - Exit codes: 0 ok; 1 refused or bad input; 2 `--wait` timed out; 3 LearnHarness unreachable, naming `LH_URL` and printing the guide's path, `docs/external-teacher.md`.
  - Commands, lesson id first:
    - `lesson new --title --key [--prompt]`
    - `say` and `plan`, which read text
    - `ask`, `probe`, `recall`, `probe-done`, `quiz` and `explain`, which read JSON
    - `answer [--wait] [--timeout]`; `--wait` checks every 2 s until there is at least one item, up to 10 minutes by default
    - `show`

    Turn commands require `--after <cursor>`. Long input comes from `--file` or stdin.
- **Teacher guide.** A short Markdown guide for the Bot Teacher, at `docs/external-teacher.md`. It covers:
  - starting LearnHarness: Node 22, listening on 127.0.0.1, browser mode (no desktop secret variables), the data directory under `/workspace`, no keys, and how to check it is up;
  - the commands per phase, with JSON examples and how to pass the cursor along;
  - that the first teaching question goes out while the phase still reads "plan";
  - the takeover flow;
  - reading answers and skips, and grading free recall in the next `say`;
  - that only the Teacher writes and its workers report back.

  For method, it names LearnHarness's own prompt files, maps their tool names to `lh` commands, and lists the tools `lh` lacks: research, demos, visuals, pdf, the learner-file tools and the graph readers.
- **Upstream footprint.** Small edits only, to:
  - the lesson record type, the chat store and its port;
  - the chat handler (one early return) and the server barrel;
  - the lesson page, the chat view, the session hook and the session model;
  - the dismiss route and the extraction pipeline;
  - the `probe_done` and `plan_init` tools, and the teaching tools' plan-node check.

  Everything else is new files.
- **Repo check.** `npm test` uses POSIX environment syntax, which fails under npm's default Windows shell. A fork-only `docs/agents/check.md` gives the check as typecheck, lint, and the test suite run with `NODE_ENV=test` from bash.

## Testing Decisions

- **Good tests check behavior.** They assert what a caller sees: the response, the saved record as the page's own folds read it, and whether a model was asked for. Never internal calls. A test passes only when that behavior works and fails when it breaks.
- **Seams.** All of these already exist:
  - Route handlers and the chat handler are driven directly with `Request` objects and an injected agent builder, as the chat-flow tests do.
  - The session model is driven directly, as the session-core tests do.
  - The extraction pipeline and compaction take injected engines.

  No new seam is needed.
- **What is tested:**
  - Each turn kind produces a record the page reads correctly: the phase fold, the open question, the plan map from the plan result, the plan-block markers, and the handoff marker.
  - Each check refuses with the right code and saves nothing: no flag, missing or unknown `after`, unread input, open question, wrong phase, unknown plan node, schema failure, refinement failure, bad Mermaid, a cyclic plan.
  - Repeats: an identical rerun is dropped, including after learner input. A `probe-done` rerun after a `say` is dropped. The same question asked again after a skip is saved.
  - Page input on a bot-run lesson, with a model and key configured so the normal path would build an agent: text and answers are saved, the agent builder is never called, and `continue` and `retry` get 422.
  - Extraction and compaction on a bot-run lesson, with an engine that throws if called.
  - The session model sends nothing automatically for a bot-run lesson, on mount and after a sync.
  - Answer items carry every stored answer field, skips come back as skips, and the bot's own results are excluded.
  - Creating a lesson twice with the same key returns the same lesson.
  - Ordinary lessons: the existing suite stays green.
- **Prior art.** The chat-flow tests (driving the chat handler with a scripted agent), the session-core tests, the `probe_done` tests, the plan-block tests, the question-tool tests, the phase tests, the extraction tests, and the chat-kind tests.
- **Manual done check, not in the suite.** On a dev server with no keys, an `lh` lesson runs from probe through teach. On the page you type, answer, skip and reload, and see no error banner, no `continue` request, and a sidebar that updates. Phase D is a Grok Bot running one real lesson with the owner on the bot computer.

## Out of Scope

Deferred in the grill or the reviews:
- background jobs (research, visuals, demos, PDFs);
- knowledge-graph extraction, which is blocked for bot-run lessons;
- summarizing long lessons;
- practice sessions;
- the Researcher, Illustrator and Librarian bots;
- a full guard against two bots writing one lesson (the cursor already refuses a writer that missed learner input);
- auth on the API (LearnHarness listens on 127.0.0.1 only);
- a "bot is thinking" indicator;
- LearnHarness grading free recall;
- a page button for starting a bot-run lesson;
- crash-safe file saves.

## Further Notes

- The grill ran across three threads. It was checked by two interrogate passes, with four reviewers each, against the code. The owner chose no third design pass, so the real diff gets `code-review` and `interrogate` per ticket.
- Glossary terms: Lesson, Bot-run lesson, Bot Teacher, Learner input, Phase, Open question, Worker (`GLOSSARY.md`). Decision record: ADR 0001.
- No code ticket is tied to the laptop, so they are `Host: linuxdev`, and development runs on linuxdev: the repo is `~/code/learnharness`, and Node 22 is in `~/.local/bin`. linuxdev has no GitHub credentials, so ticket branches stay in that repo until GitHub access is added there. Only the bench ticket is `Host: laptop`.
- The final spec ship needs the owner's "ship it" after the final spec review.
