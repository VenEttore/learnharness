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

**Open question**:
A question in a lesson that the learner has not yet answered or skipped.
_Avoid_: Pending question, dangling question

## Bots

**Worker**:
A short-lived helper a bot starts for part of its own work. A worker reports to the bot that started it and never writes to a lesson.
_Avoid_: Subagent, child bot
