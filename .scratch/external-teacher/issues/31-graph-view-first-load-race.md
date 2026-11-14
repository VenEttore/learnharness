# 31: Graph view misses a bot merge during its first load

Status: claimed
Blocked by: 29
Risk: pre-release
Gate: none
Host: linuxdev
Touches: app/api/graph (upstream route), the graph view, new tests

Deferred from 29 (2026-11-14, Matt: do it later as its own ticket). An open graph view refetches after a bot merge (29), but a merge that lands while the view is still on its first load can be missed until a reload. The clean fix edits upstream's /api/graph route, so keep it small.

- [ ] A bot merge that lands during the graph view's first load shows without a reload.
- [ ] Test that fails on today's code.
