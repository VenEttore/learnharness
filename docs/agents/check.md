# Repo check (fork)

Run from bash (Git Bash on Windows). Install once per checkout:

```
npm ci
npm run plugins:setup
```

`plugins:setup` (upstream 0.6.0) installs each source plugin's locked dependencies under `plugins/`. The typecheck reads plugin sources, so it fails without it. Rerun it when a plugin lockfile changes.

The check:

```
npm run typecheck && npm run lint && NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx
```

`npm test` runs the same suite, but its `NODE_ENV=test` prefix fails under npm's default Windows shell (cmd.exe). Run the test command directly from bash instead.
