#!/usr/bin/env bash
# Lists every comment, doc and guide line in this ticket's reach that names
# chains, the chains refusal, the count fields or the tag, for a by-hand
# match against the code. Run from the repo root.
set -u
files=(src/server/graph-findings.ts src/server/graph-reads.ts docs/external-teacher.md docs/architecture.md GLOSSARY.md docs/adr/0001-bot-run-lessons-write-native-records.md scripts/lh.mjs .scratch/external-teacher/phase-c-smoke.sh)
grep -n -i -E 'chain|linkedFacts|newFacts|learnerLine|raw body|source.?: ?"external"|chainsRefusal|lessonTotals' "${files[@]}" \
  | grep -v -i -E 'chain-rule|chain rule|long chain of nodes'
