# Interrogate round 1

## Seat C (claudeAgent claude-haiku-5-5 xhigh, reviewed 5afc629a)
1. Resend after a graph edit returns a different learnerLine from the merge's (repro A: birth lesson's traces deleted; repro B: fact deleted). Verified (rerun of repro A in the seat worktree). Kept: the count reads the graph by design (ticket: "must match lh graph sessions"). Fixed in the guide: section 7 says counts are read from the graph at reply time and linkedFacts drops links the learner deleted.

## Seat A (claudeAgent claude-opus-5-5 xhigh, reviewed 1aa3f704)
1. Same root as C/1 (guide's linkedFacts definition vs deletion). Merged with C/1; guide also names the "counts as new once its creating lesson is deleted" case. Seat's full check: tests 3497, pass 3496, fail 1 (baseline).
