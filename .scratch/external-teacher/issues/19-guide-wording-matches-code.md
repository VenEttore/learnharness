# 19: Guide, spec and comment wording matches the code

Status: claimed
Blocked by: 17
Risk: pre-release
Gate: none
Host: linuxdev
Touches: docs/external-teacher.md, .scratch/external-teacher/spec.md, comments and help text in scripts/lh.mjs and src/server/bot-run.ts

From ticket 17's ship comment (lines that word things differently from the code and the new glossary). The guide is what the Bot Teacher reads, so its lines matter most.

**What to build:** Fix each line in 17's list ("Guide, spec and code lines that differ from the glossary" in .scratch/external-teacher/issues/17-glossary-terms.md) so it matches the code and GLOSSARY.md. Confirm each against the code first; the code wins.

- [ ] Guide lines 43, 45, 49, 51, 71, 209, 213 (and the "Cursor" product vs `cursor` position wording at :5, :197 if it can mislead).
- [ ] spec.md stories 26, 27, 30, 32, line 120 and the glossary list at 204.
- [ ] Comments and help text only in scripts/lh.mjs:17 and src/server/bot-run.ts:45, :303, :343. No behavior change.
- [ ] src/core/contracts/probe.ts:94 is an upstream file: leave it unless the fix is one word.
- [ ] GLOSSARY.md Bot Teacher's _Avoid_ "driver" line: fix if wrong.
- [ ] Every JSON example in the guide still runs as before (rerun .scratch/external-teacher/phase-c-smoke.sh if any example or command text changed).
