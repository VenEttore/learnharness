# Ticket 22 card screenshots

Made 2026-11-02 on linuxdev at commit 5421a95 plus the bottom-padding change in c7399f5.

- Server: `LH_DATA_DIR=<temp dir> LH_IGNORE_ENV_KEYS=1 npx next dev -H 127.0.0.1 -p 3722`, with the desktop variables unset and no keys.
- Lessons were created with `scripts/lh.mjs`. Every JSON payload containing `$` went through `--file` (the files are in this folder):
  - probe: `lesson new`, `say --file say.txt`, then `probe --file probe.json`
  - quiz: `lesson new`, `probe-done --file done.json`, `plan --file plan.mmd`, `say --file say.txt`, then `quiz --file quiz.json`
  - none: `lesson new`, then `say --file say.txt`
- Capture: `node shot.mjs http://127.0.0.1:3722 <out dir> probe=<id> quiz=<id> none=<id>`. It uses puppeteer-core with chrome-headless-shell at 390 x 844 CSS px, DPR 2, and crops each image to the card's height.
- The script printed `non-GET requests: []` for all three page loads. The card sent no POST, so no `continue` and no answer.
- The round "N" in the bottom-left corner is Next's dev-mode indicator. It appears only under `next dev`, and the card's bottom padding keeps it clear of the content.
