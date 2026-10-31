updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  13 external-teacher-13-teacher-guide node:delegated-task:command%3Amcp%3A60d049ee-eea3-4ca9-b2c6-e887a9666300%3Adelegate-task%3Aexternal-teacher-13-1 /home/matt/.t3/worktrees/learnharness/t3-e11d9768 waiting
touches-locked: 13
merged: 02 (33e1e55), 01 (0400540), 04 (8d77b94), 03 (e51624e), 05 (phase A verified; .scratch only), 08 (2e93d6c), 06 (8247cca), 07 (5929722), 09 (phase B verified; .scratch only), 10 (17ab05a), 11 (439f106), 12 (4c38b64); check after each code merge matches baseline
notes: 03 round 5 code-review did not run (Grok 4.7 provider error twice, no substitute); last code-review was round 4 on a6b7044, ~25 lines of bot-run.ts changed after it and were covered only by round-5 interrogate (3 seats).
  flaky: tests/lh-cli.test.ts 'exits 1 with one JSON line and no request on bad input' failed once with write EPIPE in the full check after the 08 merge (load ~10.5 on 4 cores); 10/10 pass in isolation. Test-helper race from 03 (unhandled stdin EPIPE), not 08. Kept the merge; 06 fixed the helper (ignores EPIPE); full check after the 06 merge passed it.
spec-review: 07 changed check 4 to read past max(after, bot's last message) and added items to show and create replies; side effect: a second writer whose after is older than input another bot message followed is accepted, so the spec's Out of Scope line "the cursor already refuses a writer that missed learner input" holds only for input after the bot's last message. Raise at the final spec review.
spec-review (from 13): LH_IGNORE_ENV_KEYS=1 leaves ANTHROPIC_AUTH_TOKEN, ANTHROPIC_OAUTH_TOKEN, AZURE_OPENAI_API_KEY, GOOGLE_CLOUD_API_KEY, CLOUDFLARE_API_KEY, COPILOT_GITHUB_TOKEN and cloud credentials set (upstream; harmless for bot-run lessons, guide unsets them). src/agent/prompts/teacher/20-teaching.md:33 says ask_user_question appears behind "Check your understanding" but the page shows it open (upstream prompt; guide warns the bot).
proposed new ticket (from 11): writeChat in src/store/chats.ts is a plain file write; a partial write can truncate a lesson file so it can't be read. Predates this feature, affects every save. Fix: temp file plus rename, as graph.ts and auth.ts do. Put to Matt at the final spec review.
models: code-review runs on claudeAgent | claude-opus-5-5 | effort=xhigh, fastMode=false (Matt, 2026-10-31; models.md updated). Say so in every brief.
waiting on Matt: 13 stopped at the 3-round cap (tip 1ece70c; three round-3 interrogate fixes unreviewed; integration tip not merged, ship step not run). Needs "Continue 13" (rounds 4-6 of 8). On relaunch also tell it: no duplicate-id refusal exists (11: only cycles reachable); the no-plan refusal text says "call plan_init", map it to lh plan (12); 12's node check reads the latest successful plan in the transcript.
next: nothing running. 13 waits on Matt; 14 (verify phase C) follows 13; 15 is Matt's laptop bench. Ticket branches push to origin at every handoff; do not push feat/external-teacher or main until Matt says "ship it".
