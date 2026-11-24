# Code-review round 1 (reviewed 94cc9f6a; Standards and Spec on claudeAgent claude-opus-5-5 effort=xhigh)

Result: Fail (Standards had 2 hard findings). All findings fixed in the round-1 fix commit.

## Standards (8)
1. HARD docs/architecture.md:186 still said the route's node and chain lines carry the tag. Fixed: says the route refuses chains, node lines carry the tag, plus pre-32 bot chain lines.
2. HARD graph-findings.ts header said the chains refusal runs "before anything else is checked"; botLesson and switchRefusal run first. Fixed: header names the real order.
3. Test banner "the audit lock" ended up above the new chains section. Fixed: moved back above the audit-lock describe.
4. Header line about chain lines "appended through this route" described an unreachable path. Fixed: says pre-32 bot chain lines carry the tag.
5. Guard at the boundary: chainsRefusal read only the raw body. Fixed: mergeUnderLock also runs chainsRefusal on the filled, lifted findings the merge acts on.
6. Duplicated deps object and repeated `{ lesson: id, ...cursorAndItems(record) }`. Fixed: graphSessionIndex(stores); one `lesson` const in submitFindings.
7. lessonTotals exported but used only in its file. Fixed: no longer exported.
8. graph-reads.ts imported twice in the test. Fixed: one import.

## Spec (3)
1. Docstring and ticket comment said linkedFacts "equals the links entries sent"; it counts links written (a save_failed send's unwritten links are not counted). Fixed: docstring and ticket comment say "links the lesson's merges wrote", as the guide already did.
2. After the session that created a linked fact is deleted, the fact counted as both new and linked. Fixed: a node's birth line (its first line with provenance, the rule graphSessionIndex reads) is skipped for linkedFacts. Test: "counts a linked fact once, as new, after the session that created it is deleted".
3. Untested clauses: resend of a read batch with a chain, two links to one node, a chain while the graph is off. Fixed: tests added (chains test, "counts two links to one fact as two links sent", graph_disabled test).
