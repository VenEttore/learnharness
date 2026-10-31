updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  13 external-teacher-13-teacher-guide node:delegated-task:command%3Amcp%3Af3ac2e17-bdcd-4886-bd61-bf365b215c00%3Adelegate-task%3Aexternal-teacher-13-3 (attempt 3, from 38de61e, review round 3) running
touches-locked: 13
merged: 02 (33e1e55), 01 (0400540), 04 (8d77b94), 03 (e51624e), 05 (phase A verified; .scratch only), 08 (2e93d6c), 06 (8247cca), 07 (5929722), 09 (phase B verified; .scratch only), 10 (17ab05a), 11 (439f106), 12 (4c38b64); check after each code merge matches baseline
notes: 03 round 5 code-review did not run (Grok 4.7 provider error twice, no substitute); last code-review was round 4 on a6b7044, ~25 lines of bot-run.ts changed after it and were covered only by round-5 interrogate (3 seats).
  flaky: tests/lh-cli.test.ts 'exits 1 with one JSON line and no request on bad input' failed once with write EPIPE in the full check after the 08 merge (load ~10.5 on 4 cores); 10/10 pass in isolation. Test-helper race from 03 (unhandled stdin EPIPE), not 08. Kept the merge; 06 fixed the helper (ignores EPIPE); full check after the 06 merge passed it.
spec-review: 07 changed check 4 to read past max(after, bot's last message) and added items to show and create replies; side effect: a second writer whose after is older than input another bot message followed is accepted, so the spec's Out of Scope line "the cursor already refuses a writer that missed learner input" holds only for input after the bot's last message. Raise at the final spec review.
spec-review (from 13): LH_IGNORE_ENV_KEYS=1 leaves ANTHROPIC_AUTH_TOKEN, ANTHROPIC_OAUTH_TOKEN, AZURE_OPENAI_API_KEY, GOOGLE_CLOUD_API_KEY, CLOUDFLARE_API_KEY, COPILOT_GITHUB_TOKEN and cloud credentials set (upstream; harmless for bot-run lessons, guide unsets them). src/agent/prompts/teacher/20-teaching.md:33 says ask_user_question appears behind "Check your understanding" but the page shows it open (upstream prompt; guide warns the bot).
proposed new ticket (from 11): writeChat in src/store/chats.ts is a plain file write; a partial write can truncate a lesson file so it can't be read. Predates this feature, affects every save. Fix: temp file plus rename, as graph.ts and auth.ts do. Put to Matt at the final spec review.
proposed new ticket (from 13): GLOSSARY.md entries for cursor, turn, item, repeat, takeover (outside 13's Touches)
models (this project only, Matt 2026-10-31): code-review runs on claudeAgent | claude-opus-5-5 | effort=xhigh, fastMode=false (also set globally in models.md, 1338527); the interrogate panel replaces its Grok 4.7 seat with the same Opus 5.5 xhigh seat (NOT in models.md; state it in every brief). Other seats per models.md.
review rounds: Matt lifted the round cap for the rest of this project (2026-10-31). Children loop until clean; no "Continue" needed at a cap.
next: resumed after fleet update. 13 attempt 3 running (review round 3 on 38de61e; seat A owes a full lesson walk; no round cap). Then 14 (verify phase C), then queue 15 for Matt's laptop bench, then the final spec review. Do not push feat/external-teacher or main until Matt says "ship it".
