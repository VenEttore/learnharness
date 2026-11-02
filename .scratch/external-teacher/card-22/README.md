# Ticket 22 card screenshots

Made 2026-11-02 on linuxdev. Retaken after the round-3 plan-map fix (the commit that adds card-plan9-390.png). The probe lesson's call id is new each run, so its shuffle differs between captures.

- Server: `LH_DATA_DIR=<temp dir> LH_IGNORE_ENV_KEYS=1 npx next dev -H 127.0.0.1 -p 3722`, with the desktop variables unset and no keys.
- Lessons were created with `scripts/lh.mjs`. Every JSON payload containing `$` went through `--file` (the files are in this folder):
  - probe: `lesson new`, `say --file say.txt`, then `probe --file probe.json`
  - quiz: `lesson new`, `probe-done --file done.json`, `plan --file plan.mmd`, `say --file say.txt`, then `quiz --file quiz.json`
  - plan9: as quiz, with `plan --file plan9.mmd` (a nine-node plan; its titles must stay readable at 390 px)
  - none: `lesson new`, then `say --file say.txt`
- Capture: `node shot.mjs http://127.0.0.1:3722 <out dir> probe=<id> quiz=<id> plan9=<id> none=<id>`. It uses puppeteer-core with chrome-headless-shell at 390 x 844 CSS px, DPR 2, and crops each image to the card's height.
- The script printed `non-GET requests: []` for all four page loads. The card sent no POST, so no `continue` and no answer.
- The round "N" in the bottom-left corner is Next's dev-mode indicator. It appears only under `next dev`, and the card's bottom padding keeps it clear of the content.
