# Teaching a lesson with `lh`

This guide is for the Bot Teacher, the Grok Bot on the shared cloud computer that teaches a LearnHarness lesson through the `lh` command instead of LearnHarness's own model. The lesson is a bot-run lesson. LearnHarness saves your turns and the learner's input, shows them on its normal page, and never calls a model.

You run the whole lesson: probe, then plan, then teach. The learner is the owner of this computer. They answer on the lesson page in your browser, through the "Take over" button in the Cursor app, or, from a phone, in your own chat, and you save their answer with `lh submit` (section 4, "Answers outside the page").

**Ask the learner first.** Once LearnHarness is running (section 1), and before you create the lesson, ask the learner which way they want to answer. Say what each one means:
- **Phone-ready:** you ask each question in your chat, they answer there, and you save the answer with `lh submit`. Best when they're on a phone.
- **VM control:** they open your desktop with "Take over" and answer on the full lesson page. Best at a computer; slow on a phone.

Use their choice for the whole lesson, and switch if they ask.

## 1. Start LearnHarness

The examples assume the repo is at `/workspace/learnharness`. Use your own path if it is elsewhere. If it is not there yet, clone it: `git clone https://github.com/VenEttore/learnharness /workspace/learnharness`.

1. Check Node: `node -v` must print `v22.x` or newer. On Node 14.13.1 to 21, `lh` refuses every command with `"code":"node_version"`. Older Node crashes before `lh` can check and prints no JSON line: tested, Node 12.22.12 and 14.7.0 stop with a `SyntaxError`, and 14.8.0 and 14.13.0 with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
2. Install once: `cd /workspace/learnharness && npm ci`.
3. Put `lh` on your PATH: `mkdir -p ~/.local/bin && ln -sf /workspace/learnharness/scripts/lh.mjs ~/.local/bin/lh`. Check that `~/.local/bin` is on `PATH`. Without the link, run `node /workspace/learnharness/scripts/lh.mjs` wherever this guide says `lh`.
4. Start the server, bound to 127.0.0.1. First run both checks in step 5. If they pass, a LearnHarness is already running, so skip this step; section 3 confirms it is yours. Rerunning the start line empties the log, and the second server fails on the busy port. To restart, stop the old process first.

   ```bash
   cd /workspace/learnharness
   unset LH_DESKTOP_SERVER LH_DESKTOP_API_SECRET
   unset ANTHROPIC_AUTH_TOKEN ANTHROPIC_OAUTH_TOKEN AZURE_OPENAI_API_KEY GOOGLE_CLOUD_API_KEY CLOUDFLARE_API_KEY COPILOT_GITHUB_TOKEN
   mkdir -p /workspace/lh-data
   LH_DATA_DIR=/workspace/lh-data LH_IGNORE_ENV_KEYS=1 nohup npx next dev -H 127.0.0.1 -p 3000 > /workspace/lh-server.log 2>&1 &
   ```

   For a production build, run `npm run build` once, then use `npx next start -H 127.0.0.1 -p 3000` in place of `npx next dev -H 127.0.0.1 -p 3000`.

   - `-p 3000` makes a busy port fail the start (`EADDRINUSE` in the log). Without it, `next dev` moves to the next free port, and `lh` would talk to whatever else holds 3000. If 3000 is busy, start on another port as described after step 5.
   - `-H 127.0.0.1` is required. Next listens on every interface by default, and the `lh` routes have no login. LearnHarness checks the Host header, but a machine on the network can forge it. Only the bind keeps other machines out.
   - Browser mode: `LH_DESKTOP_SERVER` and `LH_DESKTOP_API_SECRET` stay unset. They belong to the desktop app.
   - `LH_DATA_DIR` under `/workspace` keeps lessons across restarts of the computer.
   - No API keys. `LH_IGNORE_ENV_KEYS=1` removes LearnHarness's key variables (`XAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` and the rest) from the server's environment. It leaves some provider tokens in place, and the second `unset` line clears those. It does not touch cloud credentials (`AWS_*`, `GOOGLE_APPLICATION_CREDENTIALS` or a gcloud login in `~/.config/gcloud`, `ANTHROPIC_FEDERATION_RULE_ID`), so start from a shell and an account that hold none. Keep no `.env*` file in the repo. Next loads those files after the shell `unset`. Add no key in Settings either. A bot-run lesson needs none.

5. Check it is up: `lh show no-such-lesson`. A LearnHarness in browser mode prints exactly `{"ok":false,"code":"not_found"}` and exits 1. Any other reply on exit 1 is not a pass: it comes from another program on the port or from a LearnHarness in desktop mode (section 2). Exit 3 means it is not reachable yet. The first start compiles for a while, so read `/workspace/lh-server.log` and try again. While it compiles, the lesson page's sidebar can show "Loading..." or "Compiling...". That is normal; do not restart the server for it. Then run `grep -E 'Local: +http://127\.0\.0\.1:3000' /workspace/lh-server.log`. It should find a line, a first sign the server is yours. Use your port in the pattern if you changed it. The lesson file in section 3 is the proof.

**Updating.** To take a newer LearnHarness, stop the server (the process you started in step 4), then:

```bash
cd /workspace/learnharness
git fetch origin && git checkout main && git reset --hard origin/main
npm ci
```

On a production build, run `npm run build` again before `npx next start`; without it, `next start` keeps serving the old build. Then start the server again as in step 4. `git reset --hard` drops any change you made in the repo; lessons in `LH_DATA_DIR` are outside it and stay. A clone made with `--single-branch` or `--depth` fetches only one branch, so `git checkout main` can fail or stay old. `git remote set-branches origin '*'`, then the fetch again, fixes it.

`lh` talks to `LH_URL`, default `http://127.0.0.1:3000`. Use the IP, not `localhost`, which can resolve to the IPv6 address while the server listens on 127.0.0.1 only. To use another port, change `-p` and set `LH_URL` to match, for example `-p 3001` and `LH_URL=http://127.0.0.1:3001`.

## 2. How `lh` replies

Every command prints one JSON line and exits with a code:

| exit | meaning |
|---|---|
| 0 | ok: `{"ok":true,...}` |
| 1 | not ok: a refusal (`{"ok":false,"code":"...",...}`), a `bad_reply`, or other JSON (below) |
| 2 | `lh answer --wait` timed out: `{"ok":false,"error":"timeout"}` |
| 3 | LearnHarness unreachable, or no answer within 30 s: `{"ok":false,"code":"unreachable","error":"...","guide":"docs/external-teacher.md"}`. This is not a refusal. If `error` says "is not reachable", start it as in section 1. If it says "did not answer", the server may be busy compiling. After a turn command, the turn may have landed, so follow "A lost reply" in section 5. After `lh lesson new`, rerun it with the same `--key`. After `lh show` or `lh answer`, rerun it. After `lh findings`, rerun it: if the first send landed, the rerun returns `alreadyRead` and writes nothing. |

A reply with `"code":"bad_reply"` means the server on `LH_URL` answered with something other than JSON: a LearnHarness error page, or another program holding the port. Any other JSON on exit 1, not shaped like a refusal, comes from another program on the port, or from a LearnHarness in desktop mode, which replies `{"error":"Desktop API access requires the trusted LearnHarness window."}`. If you started that LearnHarness yourself with `LH_DESKTOP_SERVER` or `LH_DESKTOP_API_SECRET` set, stop it and start it again as in section 1. Otherwise read `/workspace/lh-server.log`. If your server is running on another port (its `Local:` line names the port), set `LH_URL` to that port instead of starting a second one. If your server is not running, start it on another port (section 1).

**The cursor.** Every reply from LearnHarness about a lesson you can write to carries `cursor`, the id of the newest message in the lesson, except the `forbidden_*` refusals. Replies made by `lh` itself (`usage`, `node_version`, `unreachable`, `bad_reply`, a `--wait` timeout) carry none. A new lesson created without `--prompt` is empty, and its cursor is the lesson id. Pass the lesson id only when a reply gave it to you as the cursor. As `--after`, the lesson id means "from the start". On a lesson created with a prompt, a turn sent with the lesson id as `--after` is refused as `unread_input` until a Bot Teacher turn is saved. After that, such a turn counts as a repeat if it matches any saved Bot Teacher turn, and saves nothing. Every turn command needs `--after <cursor>`. In the examples, `L` is the lesson id and `C` is the cursor; after each reply, set `C` to its `cursor`.

**Items.** Learner input comes back as `items`. `lh answer` always has them. A create, a repeat, `lh show`, `lh extract-view`, and an `unread_input` or `bad_after` refusal carry `items` when there is learner input you have not responded to. That is everything after the last saved Bot Teacher turn, whether you or an earlier Bot Teacher took it. With no saved turn, it is everything since the lesson began. In an `unread_input` refusal, the items start after your `--after` instead when that message is newer than the last saved Bot Teacher turn. A create with `--prompt` returns the prompt this way. Read the items in every reply that has them, and respond to all of them, before your next turn.

**Input.** `say` and `plan` read plain text. `ask`, `probe`, `recall`, `probe-done`, `quiz`, `explain` and `submit` read one JSON object. Both come from `--file <path>` or stdin; the examples use a quoted heredoc (`<<'EOF'`), which keeps `$` and backticks literal. Never pass text or JSON in a double-quoted string (`<<<"..."`, `echo "..."`): bash expands `$name` and runs `$(...)` before `lh` sees it, so `$n$` arrives as `$`. On the command line, put text values (`--title`, `--prompt`) in single quotes; for a `'` inside, write `'\''`. The JSON never carries `kind` or `after`. Those come from the command line.

## 3. Run a lesson

### Create it

```bash
lh lesson new --title 'Binary search' --key binary-search-1 --prompt 'I want to understand why binary search is fast.'
```

```json
{"ok":true,"id":"<lesson id>","title":"Binary search","existing":false,"items":[{"type":"message","id":"<message id>","text":"I want to understand why binary search is fast."}],"cursor":"<message id>"}
```

Rerunning with the same key returns the same lesson with `"existing":true` and saves nothing, so a retried create never makes a duplicate. `--prompt` is the learner's request, saved as the first message. Check that `/workspace/lh-data/chats/<lesson id>.json` now exists. That file is the proof the server is yours, since a log line can be left over from an old server. If it is missing, another LearnHarness holds the port. Start your own on another port (section 1) and create the lesson again. Open `http://127.0.0.1:3000/chat/<lesson id>` in your browser, with your port if you changed it. That is the page the learner uses.

### Which kinds each phase takes

`lh show` reports the phase. A turn that does not fit is refused with `wrong_phase`, the current `phase`, and the kinds `allowed` now (section 5). A repeat is accepted in any phase.

| kind | phases | what it posts |
|---|---|---|
| `say` | any | teaching text, Markdown |
| `ask` | any | a question answered in the learner's own words, or a choice of options |
| `probe` | probe | a multiple-choice probe question |
| `recall` | probe | a free-recall probe question |
| `probe-done` | probe | the assessment that ends the probe |
| `plan` | plan, teach | the plan map, as Mermaid |
| `quiz` | plan, teach | a multiple-choice teaching question tagged with a plan node |
| `explain` | plan, teach | a free-recall teaching question tagged with a plan node |

One question is open at a time. After a question, wait for the learner's answer or skip (section 4). Until then, turns are refused with `open_question`. `ask`, `probe`, `recall`, `quiz` and `explain` take an optional `text` field, lead-in text shown above the question in the same message. `probe-done` refuses it.

### Probe

Find the learner's goal with `ask`. Leave out `options` for a typed answer:

```bash
lh ask "$L" --after "$C" <<'EOF'
{"text":"Before we start, I'd like to know where you're headed.","question":"What do you want to be able to do with binary search?","options":[{"label":"Explain why it takes log n steps","value":"why-log-n"},{"label":"Write it without off-by-one bugs","value":"write-it"},{"label":"Both","value":"both"}]}
EOF
```

An `ask` with options always gets an "Other" choice, where the learner types their own answer. LearnHarness adds it, so never write an option like "Something else" or "I'll type my own".

Write each wrong option as a near-miss: the answer a learner with one specific misconception would pick, close to the right one in length and form, so the right answer does not stand out. Measure what they already know with `probe` (multiple choice; `correctAnswer` is an option's `value`, and LearnHarness adds "I don't know" itself):

```bash
lh probe "$L" --after "$C" <<'EOF'
{"question":"Binary search on 1,000 sorted items takes at most about how many comparisons?","options":[{"label":"About 10","value":"ten"},{"label":"About 100","value":"hundred"},{"label":"About 500","value":"five-hundred"}],"explanation":"Each comparison halves the range, and 2^10 = 1024, so about 10 halvings reach one item.","correctAnswer":"ten"}
EOF
```

or with `recall`, where they explain in their own words. Commit the full answer in `correctAnswer` before you ask:

```bash
lh recall "$L" --after "$C" <<'EOF'
{"question":"Why does binary search need the list to be sorted?","correctAnswer":"Each step compares the target with the middle item and throws away the half that cannot contain it. Only sorted order guarantees that everything in the discarded half is on the wrong side of the target."}
EOF
```

Reply to each answer with `say` (section 4), then ask the next question. A strand is one piece of background the lesson depends on. When you know, for every strand, what the learner can already do and where they stop, end the probe:

```bash
lh probe-done "$L" --after "$C" <<'EOF'
{"assessment":{"strands":[{"strand":"Sorted order","assessment":"Solid: knows binary search needs sorted input and why."},{"strand":"Logarithms","assessment":"Floor: knows 2^10 is about 1000. Ceiling: cannot connect halving to log2 n."}],"summary":"Goal: explain why binary search takes log n steps. Start from repeated halving."}}
EOF
```

The phase moves to `plan`. LearnHarness starts no model and hands nothing over, so you stay the teacher in the same lesson. Close the probe with a short `say`.

### Plan

Present the plan in two turns, then ask for confirmation. First the approach, in prose:

```bash
lh say "$L" --after "$C" <<'EOF'
You already know why the list must be sorted. We'll build from halving: what one comparison throws away, how many halvings reach one item, and why that count is log2 n.
EOF
```

Then the map. `lh plan` reads a Mermaid graph. Node ids are permanent slugs: lowercase letters and digits, with single `-` or `_` between parts (`chain-rule`), and no leading, trailing or doubled separator. `a --> b` means a must be understood before b.

```bash
lh plan "$L" --after "$C" <<'EOF'
graph TD
  sorted[Sorted order] --> halving[One comparison halves the range]
  halving --> count[Counting halvings]
  count --> logn[Why that count is log2 n]
EOF
```

A plan that does not parse, or has a cycle, is refused with `invalid` and the problems. If a node id appears twice, the nodes merge and keep the first title given. A node written only as a bare id takes its id as its title. Send `plan` again whenever the map is wrong, in the plan or teach phase, while no question is open (an open question refuses it with `open_question`). The new map replaces the old one.

After a replace, tell the learner in chat that the plan changed. The lesson page shows the new map below the old one within a few seconds, and marks the old one "Replaced by a later plan". An open card redraws itself when the lesson changes, but reload it (or open it fresh) before you read or screenshot it, so you know it shows the new plan. Don't use the plan's `version` to spot a change: it stays 1 on every replace, as LearnHarness's own `plan_init` does. Compare the nodes in `lh show`'s `plan` instead.

Then ask, and wait for the answer:

```bash
lh ask "$L" --after "$C" <<'EOF'
{"question":"Does this plan work for you?","options":[{"label":"Yes, let's start","value":"yes"},{"label":"I'd like to change something","value":"change"}]}
EOF
```

### Teach

After the learner accepts the plan, send the first teaching question while `lh show` still says `plan`. The phase moves to `teach` when the first tagged question (`quiz` or `explain`) is posted; there is no separate step. Every teaching question carries `type` (`predict` before you teach a step, `check` after) and `nodeId`, which must be a node in the current plan:

```bash
lh quiz "$L" --after "$C" <<'EOF'
{"type":"predict","nodeId":"halving","text":"Let's start at the first node.","question":"You compare the target with the middle of 16 sorted items and it is smaller. How many items can still hold the target?","options":[{"label":"7 or 8","value":"half"},{"label":"15","value":"all-but-one"},{"label":"16","value":"all"}],"explanation":"Everything from the middle up is larger than the target, so only the lower half is left.","correctAnswer":"half"}
EOF
```

```bash
lh explain "$L" --after "$C" <<'EOF'
{"type":"check","nodeId":"logn","question":"In your own words, why does binary search on n items take about log2 n steps?","correctAnswer":"Each step halves the remaining range. After k steps n/2^k items remain, and the search ends when that reaches 1, so k = log2 n."}
EOF
```

The node check reads the latest plan that `lh plan` accepted, the one the page draws and `lh show` returns as `plan`. A `nodeId` that is not in it is refused with `invalid`, and `problems` lists some of the plan's ids. With no plan yet, `problems` says "call plan_init". That means send `lh plan` first. Sometimes a question lands, its reply is lost, and then a plan rewrite drops its node. Resending that question still returns `"repeat":true`, so the lost-reply recovery in section 5 works after a rewrite too. Teach between questions with `say`, one step at a time.

When the learner can do what their goal asked for, which is the last node of the plan, close the lesson with a `say` that sums up what they built.

## 4. Read learner input

### Items

```json
{"ok":true,"items":[{"type":"answer","id":"...","toolCallId":"...","kind":"quiz","question":"...","answers":[{"index":1,"label":"About 10"}],"dontKnow":false,"confidence":70,"correct":true}],"openQuestion":null,"cursor":"..."}
```

- `{"type":"message","id","text"}` is something the learner typed.
- `{"type":"answer",...}` is an answer.
  - `kind` is `quiz` for a `probe` or `quiz`, `explain` for a `recall` or `explain`, or `ask`. `toolCallId` names the question.
  - It always carries `question`, `dontKnow`, and the picked `answers` as `index` and `label`, with no `value`.
  - LearnHarness shuffles `probe` and `quiz` options, so `index`, counted from 1, is the order the learner saw, not your array's order. Match picks by `label`, so give every option a distinct label.
  - It carries whichever of these the page recorded. `text` is a typed answer, to free recall or to an `ask` without options. `other` is the "Other" text. `thinking` and `readingThinking` are the learner's reasoning.
  - A `probe` or `quiz` answer that picked an option has `correct` and `confidence`, one of 0, 30, 50, 70, 90, 100.
  - With `dontKnow` true, `correct` is false and `confidence` is absent. The learner declined, which is not a wrong pick.
- `{"type":"skip","id","toolCallId","kind"}` is a skip. Re-ask or move on. To re-ask, send the question again with the cursor from the reply that carried the skip. With the question's old `--after`, it counts as a repeat (section 2) and saves nothing.

LearnHarness never grades free recall. For an answer of kind `explain`, compare `text` with the `correctAnswer` you committed (it is in the question's call in `lh show`), and give your grade in the next `say`. Grade against the committed answer as written.

`lh answer` only reads, so running it twice returns the same items, in order.

### Takeover

While the learner has taken over your browser, you are paused. They answer, skip, or type on the page, then click "I'm done", and you resume. On resume, run `lh answer "$L"` once and act on its items. Empty items mean they did nothing. Ask them in the Cursor app's chat what they want.

Use `--wait` only when the learner answers on the page outside a takeover, while you keep running:

```bash
lh answer "$L" --wait --timeout 300
```

`--wait` takes no value. It checks every 2 s until there is at least one item, for 600 s unless `--timeout <seconds>` says otherwise. A timeout (exit 2) means the learner has not answered. Wait again, or ask them in the Cursor app's chat.

### Answers outside the page

A learner on a phone can still reach the lesson page through Take over, but driving your desktop from a phone is slow. The convenient path is your own chat:

1. Post the question with `lh` as usual.
2. Run `lh show "$L"` and read `openQuestion.options`: the options as the card numbers them, in the order the lesson page shows them, each with `number`, `label` and `value` (and an `ask` option's `description`). Number the options in chat by it, and show each option's `label`, never its `value` (a `value` can give the answer away). A question with options is multi-select when `openQuestion.input.multiSelect` is `true`. `options` is `[]` for a question without options (`recall`, `explain`, an `ask` without options). You do not need the card to learn the order.
3. Ask in a chat widget. Send the lead-in, the question, its options as text in `openQuestion.options` order (math converted as in "Math in chat" below) and the widget together, in one message, so nothing arrives after the question. Only when the question holds something chat text and the widget cannot show, such as a diagram, a table or laid-out code, open the question card, `http://127.0.0.1:3000/chat/<lesson id>/card` (your port if you changed it), and put its screenshot in that same message, before the widget. For any other question, leave the card closed and send no screenshot. Only your main chat agent can raise a widget; workers and routine runs cannot, so ask yourself.
   - Collect the pick (or picks) and, for a `probe` or `quiz`, the confidence. List only the numbered options, and add no typed-answer option of your own: for an `ask`, the free-text input stands in for the card's "Other". For a `probe` or `quiz`, offer the page's confidence values, 0, 30, 50, 70, 90 and 100, and "I don't know" as an extra option.
   - "I don't know" ends the question: ask no confidence after it. If your widget cannot skip its confidence step for "I don't know", ask only the pick in the first widget, and ask the confidence in a second widget sent only after a real pick.
   - Invite reasoning on every question with options: turn on the widget's free-text input (`allowCustom`) with a short hint such as "Optional: add why". The learner can type their pick and their reasoning there, or send the reasoning as a chat message. The reasoning goes in `thinking`. On an `ask`, the learner's own answer goes in `other`: text typed in place of a pick, or, on a multi-select `ask`, an extra answer typed beside picks. A reason for their pick goes in `thinking`. A single-select `ask` takes a pick or `other`, never both: if the learner picks and also types an answer of their own, ask which one they mean.
   - For `recall`, `explain` and an `ask` without options (`options` is `[]`), collect the typed answer; it goes in `text`, whatever `multiSelect` says.
4. Never say or hint whether a pick is right before its confidence is in. The learner wants it that way, and the confidence only counts when it comes first.
5. Save it with `lh submit`, silently: don't announce the save ("Got pick 2 at 70, saving"). Then grade from the answer item its reply carries.

Picks are option numbers, read and sent by number, not by label: the number the learner saw, which is `number` in `openQuestion.options`. `probe` and `quiz` options are shuffled, and `openQuestion.input` and the question's call in `messages` keep your authored order, so never number options from those. `ask` options keep your order.

```bash
lh submit "$L" --after "$C" <<'EOF'
{"picks":[2],"confidence":70,"thinking":"Each comparison halves what is left."}
EOF
```

| field | for | meaning |
|---|---|---|
| `picks` | `probe`, `quiz`, `ask` with options | option numbers from `openQuestion.options` (the card's numbers), counted from 1; one pick unless the question is multi-select |
| `confidence` | `probe`, `quiz` | required with a pick: 0, 30, 50, 70, 90 or 100 |
| `dontKnow` | `probe`, `quiz` | `true` for "I don't know"; no picks and no confidence |
| `thinking` | any question with options | the learner's reasoning, optional |
| `other` | `ask` with options | the learner's own answer in place of a pick, or beside picks on a multi-select question |
| `text` | `recall`, `explain`, `ask` without options | the typed answer |

A skip is `{"skip":true}`, alone:

```bash
lh submit "$L" --after "$C" <<'EOF'
{"skip":true}
EOF
```

`lh submit` reads the lesson, checks the answer against the question that was open at `--after`, and saves it through the lesson page's own routes, so the stored answer, grade included, is the one the page would store. The reply is what `lh answer` returns right after the save, plus `"repeat"` and the question's `toolCallId`. Its answer item has `correct`; tell the learner the result from that. `--after` must be the current cursor. A refusal saves nothing:

| code | what to do |
|---|---|
| `usage` | The JSON does not parse, has an unknown field, or a pick that is not a whole number (`null` included). |
| `invalid` | The answer does not fit the question: a pick without a confidence, a pick out of range, a field the question does not take. `problems` says what; `options` lists the card's numbers and labels. |
| `unread_input` | The learner typed something after `--after`. Read `items`, then submit again with the new `cursor`. A message typed in the instant between `lh submit`'s read and its save is not caught: the answer is saved, and the message comes back in the reply's `items`, so read them before you grade. |
| `answered` | The question already has a different answer or skip, saved on the page or by an earlier submit. `saved` shows it as the stored answer reads, with `index` and `label` per pick. |
| `no_open_question`, `bad_after` | No question was open at `--after`, or `--after` is not in this lesson. Use the cursor from the reply that posted the question, or a later one. |
| `refused` | The page route refused the save; `error` says why. |

A retry is safe. Rerun the same `lh submit` with the same `--after`, or with a cursor `lh show` gave you since, before you reply to the answer: when the first one landed, the reply has `"repeat":true` and nothing is saved again. The rerun must send the same body, `thinking` included. A different body gets `answered`, even with the answer's own `--after`.

**Math in chat.** Grok Bot chat does not treat a single `$` as math. When you copy a question, teaching text or a plan into chat, write `$...$` as `\( ... \)`. Display math (`$$...$$`) and fenced `mermaid` blocks render as they are. The card screenshot already shows math as the page renders it.

**Plans on a phone.** Keep the plan at most 2 nodes side by side, with short labels (a few words each). A long chain of nodes reads well on a phone; a wide plan does not. On a bench run, a 14-node plan 4 nodes wide was dropped from the card (only "Now: ..." showed) and its labels were about 5 px in chat. If a plan has to be wide, send the card's plan view as a screenshot instead of the `mermaid` text, and check that it is readable.

**Never build the request by hand.** `lh submit` sends picks by number and never handles the question text. If you must still hand-build a request body (for `curl`), pass it through `--file`, a single-quoted heredoc (`<<'EOF'`) or `curl --data-binary @file`, never a double-quoted string. In a double-quoted string, bash expands `$name` (an unset `$n` becomes nothing, so `$n$` arrives as `$`) and runs any `$(...)` in the lesson text while it builds the body. A bench run found those three paths clean in every case. When an answer is saved, LearnHarness restores the question text, option labels and explanation from the stored question, but not in every case:

- An option whose text has a backslash right before a newline can arrive, through bash, in another option's form, and the pick can then take that option's label.
- A shell variable that is set can turn one option's text into another option's: with `m=2` set, `$m$` arrives as `2$` and can take the label of an option `2$n$`. LearnHarness cannot see your shell.
- Leftovers of `$?`, `$$` and `$(...)` stay as they were sent.

The server also stores any `confidence` as sent (`null`, `150`, `"high"`), and takes `correct` from the request instead of grading it. `lh submit` sends only the page's confidence values and grades with the page's own code.

## 5. Refusals and recovery

LearnHarness runs its checks before it saves anything, so a refused turn adds nothing to the lesson's transcript. Fix it and resend. Refusals about a lesson carry the `cursor`; `not_found`, `not_bot_run`, `key_required`, `bad_find`, `usage`, the `forbidden_*` codes, and a create's `save_failed` do not.

| code | what to do |
|---|---|
| `unread_input` | The learner added input after your cursor and after the last saved Bot Teacher turn. Read `items`, take the new `cursor`, and respond to that input. |
| `open_question` | Wait for the open question's answer or skip. |
| `wrong_phase` | Use one of the kinds in `allowed`. |
| `invalid` | The payload failed the tool's checks. `problems` says what to fix, one line per field, such as `type must be "predict" or "check", not "foo"`. |
| `bad_after` | `--after` is not a message in this lesson. Use the reply's `cursor`, after reading its `items`. |
| `not_found` | No lesson with that id. |
| `not_bot_run` | The lesson belongs to LearnHarness's own model. Create your own with `lh lesson new`. |
| `key_required` | `lh lesson new` needs `--key`, which makes a rerun return the same lesson. |
| `bad_find` | The `lh graph find` input is not `{"propositions":[...]}` as section 7 describes. `problems` says what to fix. |
| `bad_findings` | The `lh findings` input failed the extractor's or auditor's checks (section 7). `problems` says what to fix. Nothing was written. |
| `stale_batch` | The `messageIds` you sent are not the lesson's first unread batch now, usually because new teacher text joined it. `batch` holds the current ids. Run `lh extract-view` again and redo the findings for that batch. |
| `graph_disabled` | The learner turned the knowledge graph off in LearnHarness's settings, so `lh findings` writes nothing. Skip adding findings; do not retry. |
| `graph_busy` | Something else held the graph for over 20 seconds, usually LearnHarness's own extraction of another lesson. Nothing was written. Wait a minute and resend the same findings. |
| `usage` | `lh` refused the command line before sending it: a missing flag, a misspelled flag, JSON that does not parse. |
| `save_failed` | The disk write failed. Rerun the same command; for `lh findings`, read section 7 first. |
| `internal_error` | LearnHarness failed on its own bug and saved nothing. Read `/workspace/lh-server.log`. Resending the same turn fails the same way. |
| `forbidden_origin`, `forbidden_host` | The request came from a browser, or through a non-loopback host name. Call through `lh` on this computer. |

**A lost reply.** If a turn's reply never arrives (a timeout, a crash), run `lh show "$L"` before you resend. If your turn is in `messages`, take the cursor from that reply and carry on. If not, resend the same turn with the same `--after`. When the first send did land, the resend returns `{"ok":true,"repeat":true,...}` and saves nothing. Resend the exact same content, because a reworded `say` counts as a new turn.

**Resuming a lesson.** The lesson's state lives in LearnHarness, not in your notes. `lh show "$L"` returns `phase`, `plan`, `openQuestion` (the open question's `toolCallId`, `tool`, lead-in `text`, which is `""` when there is none, `input`, and `options` numbered as the card numbers them, `[]` without options; or `null`), every message (questions keep their `toolCallId`), any unread `items`, and the `cursor`. That is enough to pick up after losing your memory, or to continue a lesson that an earlier Bot Teacher started and then stopped. To resume, run `lh show` with the lesson id; to start fresh, create a new lesson. Any notes you keep name the lesson id and the date, so an old notes file never looks like a lesson to resume.

**Only you write.** You are the only one who creates the lesson and sends turns. If you start workers, they research or draft and report back to you, and you send the turns. A worker may run `lh show` and `lh answer`, which only read. Two writers would interleave turns.

## 6. Method: LearnHarness's own prompts

The cursor rules above are mechanics. For how to probe, plan and teach, read LearnHarness's prompts. They are written for its model's tools, so translate the tool names with the table below.

- `src/agent/system-prompt.md`: the shared base, voice and philosophy.
- `src/agent/prompts/prober/10-probe-doctrine.md`: the probe.
- `src/agent/prompts/teacher/`: `05-method.md`, `10-planning.md`, `20-teaching.md`, `28-predictions.md`, `30-question-principles.md`. Skip `40-jobs.md` and `50-demos.md`, which cover tools you lack. `20-teaching.md` says `ask_user_question` arrives behind the "Check your understanding" button. On the page it arrives open; only a teach-phase `quiz` or `explain` of type `check` sits behind the button.
- `src/agent/prompts/shared/`: `10-voice.md`, `15-accuracy.md`, `16-mental-model.md`, `20-question-tools.md`, `25-confidence.md`, `40-formatting.md`. `30-learner-files.md` covers tools you lack.

| LearnHarness tool | `lh` command |
|---|---|
| plain text, or `send_to_user` | `lh say` |
| `ask_user_question` | `lh ask` |
| `probe` (the probe prompt calls it `quiz`) | `lh probe` |
| `recall` (the probe prompt calls it `explain`) | `lh recall` |
| `probe_done` | `lh probe-done` |
| `plan_init` | `lh plan`, with the `mermaid` text as input |
| `quiz` (teacher prompts) | `lh quiz` |
| `explain` (teacher prompts) | `lh explain` |
| `list_sessions`, `list_propositions` (prober) | `lh graph sessions`, `lh graph propositions` (section 7) |
| `submit_findings` (extractor) and `submit_review` (auditor) | `lh findings` (section 7) |

The input fields match the tools' fields. The prompts call the `readingThinking` field `thinkingWhileReading`. Where a prompt says "end your turn" after a question, wait for the learner's input.

`lh` has no equivalent for these tools. Where a prompt relies on one, use your own tool and put what you learn into a `say`:

| LearnHarness tool | your stand-in |
|---|---|
| `research` | web search and fetch, or workers |
| `visual` | Mermaid in chat, or a screenshot of HTML or SVG you render for anything exact; generated images are illustrations, not exact diagrams |
| `pdf` | poppler-utils on this computer |
| `find`, `ls`, `grep`, `read` | your shell on this computer; copy the learner's notes here first |
| `demo` | screenshots plus a widget on a phone; interactive only through Take over |

Workers can research and draft, but they cannot raise widgets or talk to the learner.

## 7. Read and add to the knowledge graph

LearnHarness keeps one knowledge graph across all lessons: the facts (`propositions`) each lesson taught, grouped by the session, the lesson or imported notes file, they were first learned in. The commands in the table only read it; `lh findings` adds to it. None of them calls a model.

| command | reply |
|---|---|
| `lh graph sessions` | `sessions`: every lesson or notes file that added facts, newest first, with its `id`, `name`, `kind` (`chat` or `file`), `propositions` (how many facts it added) and dates. `proberText` and `auditorText` are LearnHarness's own `list_sessions` output for its prober and its auditor. |
| `lh graph propositions <session>` | `propositions`: the facts first learned in that session, each with `nodeId`, `name`, `statement` and `aliases`. `proberText` and `auditorText` as above. An unknown id gives `[]`. |
| `lh graph find "<query>" [--offset <n>]` | Facts already in the graph that look like the query, five per page, best first: `matches[0].candidateIds` points into `candidates` (each with `statement`, the `matchedAliases` that matched, and the `sessions` it came from). `nextOffset` is the `--offset` for the next page, or `null`. Word overlap only, so a miss does not prove the fact is new. |
| `lh graph find --file <path>` | The same for several draft facts at once. The file (or stdin) is `{"propositions":[{"id":"p1","name":"Chain rule","statement":"...","aliases":[],"hints":["composition"],"offset":0}]}`; only `id` and `name` are required, and each `id` once. This is LearnHarness's auditor's `find_candidates`. |
| `lh extract-view <lesson>` | Your lesson's teacher text that has not been read for the graph yet, as LearnHarness's extractor reads it. A passage counts as read once its findings are merged, even if it added no facts. `batches` holds it oldest first, each with a `view` (`TEACHER [message id] text` passages) and its `messageIds`. `digest` lists what this lesson already added to the graph, and `prompt` is the extractor's input for the first batch: the digest, then that batch's view. Like `lh show`, it carries the lesson's `cursor` and any unread `items`. Bot-run lessons only. |

A bad `find` body is refused with `bad_find` and `problems` (section 5).

### Add your findings

`lh findings <lesson> --file <path>` (or the JSON on stdin) merges what you found in the first batch of `lh extract-view` into the graph. LearnHarness checks it and writes it the way it writes its own extractor's and auditor's output. The input is:

```json
{
  "messageIds": ["<the batch's messageIds from extract-view, in any order>"],
  "findings": {
    "propositions": [
      { "id": "p1", "name": "Chain rule", "statement": "...", "aliases": [], "messageId": "<one of messageIds>" },
      { "id": "p2", "name": "Derivative", "statement": "...", "messageId": "<one of messageIds>" }
    ],
    "chains": [{ "premises": ["p1", "<an n_ id from the digest>"], "conclusion": "p2" }]
  },
  "verdicts": { "links": [{ "id": "p2", "linkTo": "<an n_ id from lh graph find>" }] }
}
```

- `messageIds` names the batch. It must be the first unread batch's ids, all of them; order does not matter. LearnHarness rebuilds that batch itself and refuses a mismatch with `stale_batch`.
- `findings` is the extractor's `submit_findings` input: new facts only, each with its own id (`p1`, `p2`, ...; not the id of a fact already in the graph), a non-blank `name` and `statement`, and the `messageId` of the passage that states it, and the chains among your facts and existing facts' `n_` ids (the digest lists this lesson's; any fact in the graph is accepted, as for LearnHarness's extractor). Pass `"chains": []` when there are none. A batch with nothing new takes `"propositions": []` and `"chains": []`: it is marked read with nothing added, so send that only after reading the batch.
- `verdicts` is the auditor's `submit_review` input: a link says your fact is that existing fact (an id from `lh graph find`). Leave a fact out of `links` to add it as new. A chain whose premise and conclusion become the same fact once the links apply is refused.
- The reply has `merged`, the `nodes` added, the `chains` written (counted before the merge's simplification pass), `droppedChains` when that pass removed chains that a leaner chain now makes redundant (any lesson's, possibly one just written), `read` (the messages now read) and `remaining` (unread batches left). Run `lh extract-view` again before the next batch: the digest changed.
- Resending findings for a batch that is already read returns `"merged": false, "alreadyRead": true` and writes nothing, without checking the findings again.
- Every field takes real JSON values: an array, not a string holding one (LearnHarness repairs that for its own model, not for `lh`). Leave an optional field out rather than sending `null`. Unknown fields are refused.
- Facts you add are tagged `"source": "external"` on their lines in `data/graph/nodes.jsonl` and `data/graph/chains.jsonl`.
- A `save_failed` reply means a disk write failed partway: the batch stays unread, but some facts may already be written, so resending the same findings can add them twice. Run `lh extract-view` first: facts that landed are in its `digest`. Leave those out of the resend and use their `n_` ids in chains instead.
