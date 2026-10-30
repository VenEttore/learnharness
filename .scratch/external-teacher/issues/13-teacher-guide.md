# 13: Teacher guide

Status: open
Blocked by: 09
Risk: pre-release
Gate: none
Host: linuxdev
Touches: docs/external-teacher.md (new)

Phase C. Written from the spec's command contract, in parallel with tickets 10–12.

**What to build:** A short guide that lets a Grok Bot start LearnHarness on the bot computer and run a full lesson with `lh`, without reading LearnHarness's code.

- [ ] Starting LearnHarness:
  - Node 22, listening on 127.0.0.1;
  - browser mode, so neither `LH_DESKTOP_SERVER` nor `LH_DESKTOP_API_SECRET` is set;
  - `LH_DATA_DIR` under `/workspace`, and no API keys;
  - how to check it's up;
  - how to run `lh`.
- [ ] Running a lesson:
  - the commands per phase, with JSON examples and how to pass the cursor along;
  - the first teaching question goes out while `lh show` still says `plan`, after the learner accepts the plan;
  - the takeover flow: the bot is paused; on resume, run `lh answer` once, and use `--wait` only for answers outside a takeover;
  - reading answers and skips, and grading free recall in the next `say`;
  - only the Teacher writes, and its workers report back.
- [ ] Method:
  - names LearnHarness's prompt files;
  - maps tool names to `lh` commands (`send_to_user` → `lh say`, `ask_user_question` → `lh ask`, `plan_init` → `lh plan`, and the rest);
  - lists the tools `lh` lacks: research, demos, visuals, pdf, `find`, `ls`, `grep`, `read`, `list_sessions`, `list_propositions`.
- [ ] Every `lh` command and flag in the guide matches the spec's command contract. Every mapped tool name exists in LearnHarness's tools or prompt files.
- [ ] The JSON examples are written to run as-is (ticket 14 runs them).
