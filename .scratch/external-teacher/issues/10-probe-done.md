# 10: Probe-done

Status: resolved
Blocked by: 09
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/server/bot-run.ts, scripts/lh.mjs, new test files

Phase C. Uses ticket 01's shared `probe_done` result.

**What to build:** A Bot Teacher finishes the probe with an assessment. The lesson moves to the plan phase the same way it does for LearnHarness's own model, and nothing wakes.

- [x] Kinds-table row: `probe-done`, probe phase only, using the `probe_done` input schema.
- [x] One commit writes three records in order: the `probe_done` call; the shared `probe_done` result as a real tool result joined to the call by id; then the handoff marker. It never runs the tool's own code and queues nothing.
- [x] The phase fold moves from probe to plan, and `lh show` says `plan`.
- [x] Rerunning `probe-done` after a following `say`, with the same `after`, returns `repeat: true` and appends nothing.
- [x] After probe-done, `probe` and `recall` are refused as wrong phase.
- [x] `lh answer` does not return the `probe_done` result or the handoff marker.
- [x] `lh probe-done` reads JSON from `--file` or stdin.

## Comments

### Shipped 2026-10-31
Completed:
- `probe-done` row in the kinds table in src/server/bot-run.ts. It is probe phase only and uses `probeDoneInputSchema`. It takes no lead-in.
- One commit writes the `probe_done` call, then the `probeDoneSuccessResult()` result, then `newHandoffMessage(chatId)`. The result is a real tool result joined by call id, built by the new `toolSuccessMessage` helper (the toToolResult text-only mapping). The marker is the same one the model path's steer saves. It runs no tool code and queues nothing.
- Row `build` and `check` now take the chat id, which the marker needs.
- Afterwards the phase fold reads `plan`. `probe`, `recall` and `probe-done` get `wrong_phase`. A rerun after a `say` with the same `after` returns `repeat: true`. `answer` returns neither the result nor the marker.
- `lh probe-done <id> --after <cursor>` reads JSON from `--file` or stdin. `QUESTION_KINDS` is renamed `JSON_KINDS`.
- From interrogate round 1 (Haiku 5.5): an optional field sent as `null` is now a 422 on every kind. pi's validator dropped it, so the stored call did not hold what the bot sent.

Deferred: none. docs/external-teacher.md belongs to ticket 13.

Verified:
- Full check after merging feat/external-teacher at b827328: `npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx` gave 3054 tests, 3053 pass, 1 fail. The failure is the baseline Pi main-loader test.
- tests/bot-run-probe-done.test.ts failed (4 of 6) before the change and passed 6 of 6 after. Its null case failed (200) before 2044aa8 and passed (422) after.
- The lh-cli probe-done case failed against the old lh.mjs and passed after.
- Review used 2 rounds. Code-review (Opus 5.5 xhigh) passed Standards and Spec in both rounds. Interrogate round 1 (Grok 4.7, GLM 5.3 Flash, Haiku 5.5, Composer 2.5) found one Act On item, which is fixed. Round 2 found none.
- During round 1, Haiku saw browser-service-readiness fail in its full runs, but it passed alone. It passed in both of my full runs.
- Blast radius skipped: Risk is pre-release.
