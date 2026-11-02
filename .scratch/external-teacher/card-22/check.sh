#!/usr/bin/env bash
# Ticket 22: the repo check (docs/agents/check.md) with the host's test
# concurrency, logged to a fixed path.
npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test --test-concurrency=2 tests/*.test.ts tests/*.test.tsx
