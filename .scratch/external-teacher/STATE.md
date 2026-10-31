updated: 2026-10-31
base: feat/external-teacher
max_suborchestrators: 2
destination: One LearnHarness lesson taught by a Grok Bot through lh, with no LearnHarness model calls.
host: linuxdev, repo ~/code/learnharness, Node 22 in ~/.local/bin.
live:
  (none running)
touches-locked: none
merged: 02 (33e1e55), 01 (0400540), 04 (8d77b94), 03 (e51624e), 05 (phase A verified; .scratch only), 08 (2e93d6c), 06 (8247cca), 07 (5929722), 09 (phase B verified; .scratch only), 10 (17ab05a), 11 (439f106), 12 (4c38b64), 13 (815aa6d; docs only, child check at the same code tree matched baseline); check after each code merge matches baseline, 14 (b2d80fc; phase C verified; .scratch only)
notes: 03 round 5 code-review did not run (Grok 4.7 provider error twice, no substitute); last code-review was round 4 on a6b7044, ~25 lines of bot-run.ts changed after it and were covered only by round-5 interrogate (3 seats).
  flaky: tests/lh-cli.test.ts 'exits 1 with one JSON line and no request on bad input' failed once with write EPIPE in the full check after the 08 merge (load ~10.5 on 4 cores); 10/10 pass in isolation. Test-helper race from 03 (unhandled stdin EPIPE), not 08. Kept the merge; 06 fixed the helper (ignores EPIPE); full check after the 06 merge passed it.
spec-review: 07 changed check 4 to read past max(after, bot's last message) and added items to show and create replies; side effect: a second writer whose after is older than input another bot message followed is accepted, so the spec's Out of Scope line "the cursor already refuses a writer that missed learner input" holds only for input after the bot's last message. Raise at the final spec review.
spec-review (from 13): LH_IGNORE_ENV_KEYS=1 leaves ANTHROPIC_AUTH_TOKEN, ANTHROPIC_OAUTH_TOKEN, AZURE_OPENAI_API_KEY, GOOGLE_CLOUD_API_KEY, CLOUDFLARE_API_KEY, COPILOT_GITHUB_TOKEN and cloud credentials set (upstream; harmless for bot-run lessons, guide unsets them). src/agent/prompts/teacher/20-teaching.md:33 says ask_user_question appears behind "Check your understanding" but the page shows it open (upstream prompt; guide warns the bot).
proposed new ticket (from 11): writeChat in src/store/chats.ts is a plain file write; a partial write can truncate a lesson file so it can't be read. Predates this feature, affects every save. Fix: temp file plus rename, as graph.ts and auth.ts do. Put to Matt at the final spec review.
proposed new ticket (from 13): GLOSSARY.md entries for cursor, turn, item, repeat, takeover, strand, refusal (outside 13's Touches). 13 also lists untested code paths checked by hand: bad_reply, did-not-answer exit 3, failed save on lesson new, unread_input with --after newer than the last turn
models (this project only, Matt 2026-10-31): code-review runs on claudeAgent | claude-opus-5-5 | effort=xhigh, fastMode=false (also set globally in models.md, 1338527); the interrogate panel replaces its Grok 4.7 seat with the same Opus 5.5 xhigh seat (NOT in models.md; state it in every brief). Other seats per models.md.
review rounds: Matt lifted the round cap for the rest of this project (2026-10-31). Children loop until clean; no "Continue" needed at a cap.
next: 15 queued in laptop-queue.md (bench branch external-teacher-15-bench at b2d80fc, pushed). Final review packet drafted at .scratch/external-teacher/final-review.md; waiting on Matt for "15 done" and for decisions 1-6 in the packet. Separate: README branch readme-fork-goals (cffce62, pushed). Do not push feat/external-teacher or main until Matt says "ship it".
