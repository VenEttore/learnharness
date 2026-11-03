# LearnHarness

A tutor that probes what a learner knows, plans a path, and teaches along it. Lessons are taught either by LearnHarness's own model or by an outside agent.

## Lessons

**Lesson**:
One course of teaching with one learner: probe, then plan, then teach, in a single transcript.
_Avoid_: Chat (the code's name for the stored record), conversation

**Bot-run lesson**:
A lesson whose teaching turns are written by a Bot Teacher instead of LearnHarness's own model.
_Avoid_: External chat (the code marks these lessons `driver: "external"`), agent session

**Bot Teacher**:
The outside agent that plays both the prober and the teacher in a bot-run lesson.
_Avoid_: External model, driver (the code's name for the lesson field that marks who teaches)

**Learner input**:
Everything the learner did since the last saved Bot Teacher turn, or since the lesson began if there is none: answers, skips, and typed messages. Any Bot Teacher's turn counts, not only the current one's.
_Avoid_: Reply (what LearnHarness or `lh` sends back), response

**Item**:
One piece of learner input, as the Bot Teacher receives it.
_Avoid_: Event, entry

**Phase**:
One of a lesson's three parts, in order: probe (find what the learner already knows), plan (lay out the path), teach (walk it). In each phase LearnHarness saves only some kinds of turn and gives its model only some of its tools.
_Avoid_: Stage, mode

**Strand**:
One piece of background a lesson depends on. The probe ends with an assessment of how far the learner gets on each strand.
_Avoid_: Topic, prerequisite

**Open question**:
A question in a lesson that the learner has not yet answered or skipped.
_Avoid_: Pending question, dangling question

**Lead-in**:
Text the teacher puts right before a question in the same message, shown above it. In `lh`, the `text` field of `ask`, `probe`, `recall`, `quiz` and `explain`.
_Avoid_: Preamble, intro

**Question card**:
A read-only page, `/chat/<lesson id>/card`, that shows a lesson's open question with its lead-in and options, numbered in the order the lesson page shows them, sized for a phone screenshot. A learner answering outside the page replies with those numbers.
_Avoid_: Card view, question preview

## Turns

**Turn**:
One go at a lesson by whoever teaches it: one run of LearnHarness's own model, or one `lh` turn command from the Bot Teacher (`say`, `ask`, `probe`, `recall`, `probe-done`, `plan`, `quiz` or `explain`). The command names the Bot Teacher turn's kind.
_Avoid_: Message (one turn can store several)

**Cursor**:
The newest point in a lesson's transcript at the moment LearnHarness sent the reply that carried it. The Bot Teacher sends a cursor with each turn, and LearnHarness refuses any turn that is not a repeat while learner input is newer than both that cursor and the last saved Bot Teacher turn.
_Avoid_: Offset, position

**Repeat**:
A Bot Teacher turn that matches a turn saved after the cursor it was sent with, or an `lh submit` whose answer is already saved for the question open at its cursor. It is accepted and saves nothing.
_Avoid_: Duplicate, retry (the resend, which may or may not be a repeat)

**Refusal**:
A reply with a failure code that says why: from LearnHarness when it did not do what a request asked, or from `lh` when it turns down a command line before sending it. A refused turn adds nothing to the lesson's transcript.
_Avoid_: Error, rejection

## Bots

**Worker**:
A short-lived helper a bot starts for part of its own work. A worker reports to the bot that started it and never writes to a lesson.
_Avoid_: Subagent, child bot

**Takeover**:
The learner taking control of the Bot Teacher's browser to use the lesson page, until they give control back. The Bot Teacher is paused while the learner has control.
_Avoid_: Handoff (the code's name for the marker the end of the probe leaves), taking over (for a Bot Teacher resuming a lesson)

## Knowledge graph

**Knowledge graph**:
The one store of what the learner has been taught, shared by every lesson. LearnHarness's extractor and auditor decide what goes in, and plain code writes it.
_Avoid_: Graph data, memory

**Extractor**:
LearnHarness's model step that reads a lesson's new teacher text and proposes the propositions and chains it teaches. In a bot-run lesson the Bot Teacher does this thinking instead.
_Avoid_: Parser

**Auditor**:
LearnHarness's model step that compares the extractor's propositions with the ones already in the knowledge graph and decides which are the same idea. In a bot-run lesson the Bot Teacher does this thinking instead.
_Avoid_: Reviewer, deduplicator

**Chain**:
Propositions that together imply another proposition: the premises and the conclusion.
_Avoid_: Edge (the graph view's drawn line), derivation

**Proposition**:
One self-contained idea in the knowledge graph, with a short name and a full statement. The guide calls it a fact.
_Avoid_: Node (the code's name for its stored record), concept

**Session**:
A lesson or imported notes file that added propositions to the knowledge graph. A proposition belongs to the session it was first learned in.
_Avoid_: Cluster (the drawn group of a session's propositions), source

**Extraction view**:
A lesson's teacher text that has not been read for the knowledge graph yet (a passage counts as read once its batch is merged, even if it added nothing), in batches, each passage labelled with its message id: what the extractor reads.
_Avoid_: Transcript (the whole lesson), prose view

**Digest**:
The propositions and chains a lesson has already added to the knowledge graph, listed for the extractor before its next batch.
_Avoid_: Summary

**Candidate**:
A proposition already in the knowledge graph that looks like a new one, found by word overlap. Deciding whether the two are the same idea is the auditor's job.
_Avoid_: Duplicate. `find` replies list each query's candidates under `matches` (the code's name).
