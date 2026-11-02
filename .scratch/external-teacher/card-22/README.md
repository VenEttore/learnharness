# Ticket 22 card screenshots

Made 2026-11-02 on linuxdev, retaken after the round-6 fix (inline formulas shrink to their box) (the card is in the page flow and hides the app shell; wide content, code blocks included, shrinks to fit the column; long words and inline code break; the renderers' copy buttons are hidden). The probe lesson's call id is new each run, so its shuffle differs between captures.

- Server: `LH_DATA_DIR=<temp dir> LH_IGNORE_ENV_KEYS=1 npx next dev -H 127.0.0.1 -p 3722`, with the desktop variables unset and no keys.
- Lessons were created with `scripts/lh.mjs`. Every JSON payload containing `$` went through `--file` (the files are in this folder):
  - probe: `lesson new`, `say --file say.txt`, then `probe --file probe.json`
  - quiz: `lesson new`, `probe-done --file done.json`, `plan --file plan.mmd`, `say --file say.txt`, then `quiz --file quiz.json`
  - plan9: as quiz, with `plan --file plan9.mmd` (a nine-node plan; its titles must stay readable at 390 px)
  - wide: `lesson new`, `say --file wide-say.txt` (a wide table and display math), then `probe --file wide-probe.json` (display math in the question, a code block in the details)
  - longword: `lesson new`, then `probe --file longword-probe.json` (a 90-character word in the lead-in and an option, a long inline-code option, and an inline formula with no break point)
  - none: `lesson new`, then `say --file say.txt`
- Capture: `node shot.mjs http://127.0.0.1:3722 <out dir> probe=<id> quiz=<id> plan9=<id> wide=<id> longword=<id> none=<id>`. It uses puppeteer-core with chrome-headless-shell at 390 x 844 CSS px, DPR 2, and a plain full-page screenshot, the way a bot would take one.
- Its output for this capture:

```
probe {"shownButtons":0,"documentHeight":844,"cardHeight":844,"documentWidth":390,"clipped":[],"outside":[]}
quiz {"shownButtons":0,"documentHeight":1166,"cardHeight":1166,"documentWidth":390,"clipped":[],"outside":[]}
plan9 {"shownButtons":0,"documentHeight":1465,"cardHeight":1466,"documentWidth":390,"clipped":[],"outside":[]}
wide {"shownButtons":0,"documentHeight":944,"cardHeight":945,"documentWidth":390,"clipped":[],"outside":[]}
longword {"shownButtons":0,"documentHeight":844,"cardHeight":844,"documentWidth":390,"clipped":[],"outside":[]}
none {"shownButtons":0,"documentHeight":844,"cardHeight":844,"documentWidth":390,"clipped":[],"outside":[]}
non-GET requests: []
```

  The document is as tall and as wide as the card, nothing is cut off at the right edge, no element reaches past the card (`outside`), no control is displayed (`shownButtons`), and the card sent no POST (no `continue`, no answer).
- In the wide capture, the 491 px display equation in the question is shrunk to fit the column: complete, but small. Code blocks keep their lines (no wrapping into the line-number gutter) and shrink to fit, as does the table.
