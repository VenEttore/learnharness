updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  17 external-teacher-17-glossary-terms node:delegated-task:command%3Amcp%3A37eadc96-b7b5-4910-921c-fc4e1ec721dd%3Adelegate-task%3Aexternal-teacher-17-1 running
touches-locked: 17 (GLOSSARY.md), 18 (new test files)
merged: 02 (33e1e55), 01 (0400540), 04 (8d77b94), 03 (e51624e), 05 (phase A verified; .scratch only), 08 (2e93d6c), 06 (8247cca), 07 (5929722), 09 (phase B verified; .scratch only), 10 (17ab05a), 11 (439f106), 12 (4c38b64), 13 (815aa6d; docs only, child check at the same code tree matched baseline); check after each code merge matches baseline, 14 (b2d80fc; phase C verified; .scratch only), 16 (merged; review skipped under small-diff rule, 19 lines, test red then green)
notes: 03 round 5 code-review did not run (Grok 4.7 provider error twice, no substitute); last code-review was round 4 on a6b7044, ~25 lines of bot-run.ts changed after it and were covered only by round-5 interrogate (3 seats).
  flaky: tests/lh-cli.test.ts 'exits 1 with one JSON line and no request on bad input' failed once with write EPIPE in the full check after the 08 merge (load ~10.5 on 4 cores); 10/10 pass in isolation. Test-helper race from 03 (unhandled stdin EPIPE), not 08. Kept the merge; 06 fixed the helper (ignores EPIPE); full check after the 06 merge passed it.
spec-review: 07 changed check 4 to read past max(after, bot's last message) and added items to show and create replies; side effect: a second writer whose after is older than input another bot message followed is accepted, so the spec's Out of Scope line "the cursor already refuses a writer that missed learner input" holds only for input after the bot's last message. Raise at the final spec review.
spec-review (from 13): LH_IGNORE_ENV_KEYS=1 leaves ANTHROPIC_AUTH_TOKEN, ANTHROPIC_OAUTH_TOKEN, AZURE_OPENAI_API_KEY, GOOGLE_CLOUD_API_KEY, CLOUDFLARE_API_KEY, COPILOT_GITHUB_TOKEN and cloud credentials set (upstream; harmless for bot-run lessons, guide unsets them). src/agent/prompts/teacher/20-teaching.md:33 says ask_user_question appears behind "Check your understanding" but the page shows it open (upstream prompt; guide warns the bot).
models (this project only, Matt 2026-10-31): code-review runs on claudeAgent | claude-opus-5-5 | effort=xhigh, fastMode=false (also set globally in models.md, 1338527); the interrogate panel replaces its Grok 4.7 seat with the same Opus 5.5 xhigh seat (NOT in models.md; state it in every brief). Other seats per models.md.
review rounds: Matt lifted the round cap for the rest of this project (2026-10-31). Children loop until clean; no "Continue" needed at a cap.
next: Matt approved final-review items 1-6 (2026-11-01): 16 atomic writeChat, 17 glossary, 18 lh edge-path tests; 4 spec sentence fixed; 5 and 6 accepted. 15 bench queued (Matt discusses findings later). Launch 16+17, then 18. Then final review again, then "ship it". Do not push feat/external-teacher or main until Matt says "ship it".
