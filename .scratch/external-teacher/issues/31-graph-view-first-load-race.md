# 31: Graph view misses a bot merge during its first load

Status: resolved
Blocked by: 29
Risk: pre-release
Gate: none
Host: linuxdev
Touches: app/api/graph (upstream route), the graph view, new tests

Deferred from 29 (2026-11-14, Matt: do it later as its own ticket). An open graph view refetches after a bot merge (29), but a merge that lands while the view is still on its first load can be missed until a reload. The clean fix edits upstream's /api/graph route, so keep it small.

- [x] A bot merge that lands during the graph view's first load shows without a reload.
- [x] Test that fails on today's code.

## Comments

### Shipped 2026-11-14
Three review rounds ran, all this launch allowed. Round 3 left one Act On item. I fixed it in f43a55f1: 14 lines added and 5 removed outside tests, and no new interface. No seat reviewed that commit, so it ships under the small-diff rule. The fix followed a diagnosis loop, because it was the third finding of one kind (a failed graph fetch drops a stamp the gate has seen).

Completed:
- `/api/graph` now returns `graphDataRevision`, the same stamp `/api/graph/status` returns. The route reads it before the graph, so it is never newer than the data. The upstream route edit adds 5 lines and removes 2.
- The graph view compares each status stamp with the stamp of the snapshot on screen, not with the previous status read. The rule is in a new file, components/graph-refetch-gate.ts (`graphRefetchGate`). The view tells the gate when each graph fetch starts, lands or fails, and passes it every status stamp. The view edit adds 18 lines and removes 12.
- How the gate behaves:
  - While a fetch is out, it keeps the stamp that fetch answers for. A different stamp restarts the fetch, as each moved stamp did before; repeats wait, so steady events cannot starve a slow fetch.
  - For a fetch the gate did not start (the first load, a run row leaving, a deletion), it takes the first status stamp seen while the fetch is out and checks it when the fetch lands.
  - A seen stamp stays owed until a fetch that started after it has landed. A failed fetch is retried once for an owed stamp; after that, the next status read refetches.
- Review fixes, by round:
  - Round 1: two status replies out of order before the first snapshot; a failed first fetch; each status read during a refetch restarting it.
  - Round 2: a first read that never settles blocking later refetches; a stamp held through a failed read being dropped.
  - Round 3: a stale status reply, or a fetch the gate did not start, making a failed fetch skip its retry; the view not passing the stamp of a status reply in which a run row left.
- The diagnosis found one false premise behind all three failure findings: "a stamp the gate drops or never sees is covered by a fetch that reads newer data". That holds only when the fetch lands. The gate now keeps owed stamps instead.
- Ticket 30's files (components/graph-data-tick.ts, components/extraction-coverage.tsx) are untouched. `git merge-tree` with ticket 30's branch is clean (seat A, round 3). Ticket 30's hook could later reuse the route's stamp: if the first /api/graph reply carries it, the hook's "first read counts as a move" refetch is no longer needed. That belongs to whichever ticket merges second.

Deferred:
- A graph request that never returns, neither landing nor failing (interrogate C, round 3): if the only status read that saw a merge arrives while the first read hangs, the merge is not shown until another status read or a reload. I declined it for this ticket. The view then shows no graph at all, the pre-ticket view fails the same repro, and the fix is a timeout on the graph fetch, which is new behaviour. It is a candidate for a follow-up ticket.
- Code-review judgement call (round 3): the gate's state names `asked` and `asking` differ only by suffix. I wrote a rename and then dropped it, to keep the fix after round 3 under the small-diff limit.
- Accepted costs: a stale status reply costs one redundant fetch, and so does a stamp read just before a merge. After a failed retry, the view waits for the next status read.

Verified:
- Full repo check at 73628ef0 (f43a55f1 with feat/external-teacher fd8432fc merged in): typecheck passes. Lint has 0 errors and 1 warning, the existing `<head>` one. 3485 of 3486 tests pass. The one failure is the baseline Pi loader test.
- phase-c-smoke.sh on port 3189 at 73628ef0: PASS, with 102 ok lines and 0 FAIL.
- tests/graph-view-first-load.test.tsx mounts the real GraphView with a fake server, 7 tests. Tests 1, 2 and 4 fail on the pre-ticket view, with 1 graph read where 2 are needed. Tests 3 to 6 each fail on the round they guard. Test 7 is the no-merge control.
- tests/graph-refetch-gate.test.ts runs the real gate in a model of the view's wiring, with random reply orders, cancellations, run rows leaving, deletions and failures. It has 3 model properties over 20,000 orders each, plus 3 unit cases. The round-3 property ("never drops a stamp it has seen") was red at seed 111 on 312cd9f6 and is green now. A 200,000-run sweep has 0 misses. A mutant that drops owed stamps on every landing has 284.
- A route test in tests/graph-findings.test.ts: `/api/graph` and `/api/graph/status` agree when nothing is written between them, both move after a bot merge, and the test fails on the old route.
- After f43a55f1, I reran seat models and repros against the fix. Seat A's round-3 stricter model, short-run sweeps and 3 real-view repros: 23 of 23 pass. Seat A's round-2 model in random mode: 0 misses in 50,000 orders. Code-review's round-3 repros now retry. C's round-3 stalled-read repro still fails, as deferred above.
- Review: rounds 1 to 3, 3 of 8 used.
  - Seats: code-review on Opus 5.5 xhigh, A on Opus 5.5 xhigh, B on GLM 5.3 Flash high (fallback for the GLM seat), C on Haiku 5.5 xhigh, and D on Sonnet 5.5 high (fallback for the Composer seat; Cursor is unavailable until 2026-11-19).
  - Act On items: round 1 had 4 distinct (code-review 1 Spec and 2 Standards, A 3, B 0, C 3, D 1). Round 2 had 3 (code-review 2 Standards, C 2, A, B and D 0). Round 3 had 2 (code-review 1 Spec and 2 Standards, C 1, A, B and D 0).
  - Each round's items are fixed or deferred above. Seats proved every finding by running code.
- blast-radius: skipped (Risk: pre-release).
