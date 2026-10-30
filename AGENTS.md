<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Global workflow rules: `~/.agents/AGENTS.md` (fleet). They decide how work runs here: grilling, questions, modes, review.

## Fork

This is Matt's fork of LearnHarness. It adds bot-run lessons: outside agents (Grok Bots on a shared cloud computer) teach through LearnHarness's HTTP API and an `lh` CLI instead of LearnHarness's own model.

- `origin` is `VenEttore/learnharness`. `upstream` is `amosblomqvist/learnharness`. Upstream updates come in by merging `upstream/main`.
- Put fork changes in new files where you can, and keep edits to upstream files small, so those merges stay clean.
- When an upstream merge touches this file, keep the fork's version below the Next.js block.
