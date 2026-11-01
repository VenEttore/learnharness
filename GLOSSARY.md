# LearnHarness

A tutor that probes what a learner knows, plans a path, and teaches along it. Lessons are taught either by LearnHarness's own model or by an outside agent.

## Lessons

**Lesson**:
One teaching session with one learner: probe, then plan, then teach, in a single transcript.
_Avoid_: Chat (the code's name for the stored record), conversation

**Bot-run lesson**:
A lesson whose teaching turns are written by a Bot Teacher instead of LearnHarness's own model.
_Avoid_: External chat (the code marks these lessons `driver: "external"`), agent session

**Bot Teacher**:
The outside agent that plays both the prober and the teacher in a bot-run lesson.
_Avoid_: External model, driver

**Learner input**:
Everything the learner did since the Bot Teacher's last turn: answers, skips, and typed messages.
_Avoid_: Reply, response

**Phase**:
One of a lesson's three stages, in order: probe (find what the learner already knows), plan (lay out the path), teach (walk it). Each phase has its own kinds of question.
_Avoid_: Stage, mode

**Strand**:
One piece of background a lesson depends on. The probe ends with an assessment of how far the learner gets on each strand.
_Avoid_: Topic, prerequisite

**Open question**:
A question in a lesson that the learner has not yet answered or skipped.
_Avoid_: Pending question, dangling question

## Turns

**Turn**:
One post the Bot Teacher makes to a lesson, of a single kind: teaching text, a question, a plan, or the assessment that ends the probe.
_Avoid_: Message (one turn can store several), post

**Cursor**:
The id of a lesson's newest message, or the lesson's own id while it is empty. The Bot Teacher sends the cursor it last received with each turn, to show what it has read.
_Avoid_: Offset, position

**Item**:
One piece of learner input as the Bot Teacher receives it: a typed message, an answer, or a skip.
_Avoid_: Event, entry

**Repeat**:
A turn sent again that matches a Bot Teacher turn already posted after the cursor it carries. LearnHarness reports success and saves nothing.
_Avoid_: Duplicate, retry

**Refusal**:
A reply that turns down a command and names the reason with a code. A refused turn saves nothing.
_Avoid_: Error, rejection

**Takeover**:
The learner taking control of the Bot Teacher's browser to use the lesson page. The Bot Teacher is paused until the learner hands control back.
_Avoid_: Handoff, session

## Bots

**Worker**:
A short-lived helper a bot starts for part of its own work. A worker reports to the bot that started it and never writes to a lesson.
_Avoid_: Subagent, child bot
