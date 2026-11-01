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
Everything the learner did since the Bot Teacher's last saved turn: answers, skips, and typed messages.
_Avoid_: Reply, response

**Item**:
One piece of learner input, as the Bot Teacher receives it.
_Avoid_: Event, entry

**Phase**:
One of a lesson's three parts, in order: probe (find what the learner already knows), plan (lay out the path), teach (walk it). LearnHarness allows only some kinds of turn, and some of its model's tools, in each phase.
_Avoid_: Stage, mode

**Strand**:
One piece of background a lesson depends on. The probe ends with an assessment of how far the learner gets on each strand.
_Avoid_: Topic, prerequisite

**Open question**:
A question in a lesson that the learner has not yet answered or skipped.
_Avoid_: Pending question, dangling question

## Turns

**Turn**:
One go at a lesson by whoever teaches it: one lh turn command from the Bot Teacher, or one full run of LearnHarness's own model. A Bot Teacher turn is one of: teaching text, a question, a plan, or the assessment that ends the probe.
_Avoid_: Message (one turn can store several)

**Cursor**:
The newest point in a lesson's transcript, as of LearnHarness's latest reply to the Bot Teacher. The Bot Teacher sends a cursor with each turn, and LearnHarness refuses any turn that is not a repeat while learner input is newer than both that cursor and the Bot Teacher's last saved turn.
_Avoid_: Offset, position

**Repeat**:
A Bot Teacher turn that matches a turn already in the lesson past the cursor sent with it. LearnHarness accepts it and saves nothing.
_Avoid_: Duplicate, retry (the resend, which may or may not be a repeat)

**Refusal**:
LearnHarness not doing what a request asked and saying why, or lh turning down a command line before sending it. A refused turn adds nothing to the lesson's transcript.
_Avoid_: Error, rejection

## Bots

**Worker**:
A short-lived helper a bot starts for part of its own work. A worker reports to the bot that started it and never writes to a lesson.
_Avoid_: Subagent, child bot

**Takeover**:
The learner taking control of the Bot Teacher's browser to use the lesson page, until they hand control back. The Bot Teacher is paused while the learner has control.
_Avoid_: Handoff, taking over (for a Bot Teacher resuming a lesson)
