# 16: Atomic chat file writes

Status: resolved
Blocked by: none
Risk: pre-release
Gate: none
Host: linuxdev
Touches: src/store/chats.ts, new test files

From the final spec review (item 1, Matt approved 2026-11-01). Found by ticket 11's interrogate seat C.

**What to build:** `writeChat` in src/store/chats.ts writes the chat file with a plain `writeFileSync`, so a write cut off partway (disk full, crash) can truncate the file and make the lesson unreadable. Every save path goes through it, ordinary lessons included. Write to a temp file in the same directory, then rename it over the target, the way src/store/graph.ts and auth.ts already do.

- [x] `writeChat` writes a temp file and renames it into place; reuse the existing atomic-write helper if one exists rather than adding another.
- [x] A test simulates a failed write partway through (e.g. ENOSPC) and shows the previous chat file is still intact and readable, and no temp file is left behind.
- [x] The edit to the upstream file stays small.

## Comments

### Shipped 2026-11-01
Completed: `writeChat` in src/store/chats.ts now writes `<id>.json.tmp-<8 hex>` beside the chat file and renames it into place, unlinking the temp file on failure. No helper is exported; it copies graph.ts's `rewriteLedgers` pattern. Every save path goes through `writeChat`, so ordinary lessons are covered too. The temp name does not end in `.json`, so `listChats` skips it.
Completed: tests/chat-atomic-write.test.ts mocks `fs.writeFileSync` to write half the bytes and then throw ENOSPC. It asserts the old chat file is byte-identical and still reads through `getChat`, and that no temp file is left. A second test covers a normal save. The ENOSPC test failed before the fix (target truncated) and passes after it.
Deferred: none.
Verified: `npm run typecheck`: 0. `npm run lint`: 0. `NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx`: 3087/3088 pass, 1 run. The one failure is the baseline Pi main-loader test. Review skipped under the small-diff rule: 19 changed lines in src (17 added, 2 removed), Risk pre-release, no public interface change. Blast-radius skipped: Risk pre-release.
