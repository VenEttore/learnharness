# Interrogate round 1

## Seat C (claudeAgent claude-haiku-5-5 xhigh, reviewed 5afc629a)
1. Resend after a graph edit returns a different learnerLine from the merge's (repro A: birth lesson's traces deleted; repro B: fact deleted). Verified (rerun of repro A in the seat worktree). Kept: the count reads the graph by design (ticket: "must match lh graph sessions"). Fixed in the guide: section 7 says counts are read from the graph at reply time and linkedFacts drops links the learner deleted.
