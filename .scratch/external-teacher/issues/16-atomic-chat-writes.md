# 16: Atomic chat file writes

Status: open
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/store/chats.ts, new test files

From the final spec review (item 1, Matt approved 2026-11-01). Found by ticket 11's interrogate seat C.

**What to build:** `writeChat` in src/store/chats.ts writes the chat file with a plain `writeFileSync`, so a write cut off partway (disk full, crash) can truncate the file and make the lesson unreadable. Every save path goes through it, ordinary lessons included. Write to a temp file in the same directory, then rename it over the target, the way src/store/graph.ts and auth.ts already do.

- [ ] `writeChat` writes a temp file and renames it into place; reuse the existing atomic-write helper if one exists rather than adding another.
- [ ] A test simulates a failed write partway through (e.g. ENOSPC) and shows the previous chat file is still intact and readable, and no temp file is left behind.
- [ ] The edit to the upstream file stays small.
