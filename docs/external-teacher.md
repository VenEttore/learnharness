# Teaching a lesson with `lh`

This guide is for the Bot Teacher: a Grok Bot on the shared cloud computer that teaches a LearnHarness lesson through the `lh` command instead of LearnHarness's own model. The lesson is a bot-run lesson. LearnHarness saves your turns and the learner's input, shows them on its normal page, and never calls a model.

You run the whole lesson: probe, then plan, then teach. The learner is the owner of this computer. They answer on the lesson page in your browser, through Cursor's "Take over".

## 1. Start LearnHarness

The examples assume the repo is at `/workspace/learnharness`. Use your own path if it is elsewhere.

1. Check Node: `node -v` must print `v22.x`.
2. Install once: `cd /workspace/learnharness && npm ci`.
3. Put `lh` on your PATH: `mkdir -p ~/.local/bin && ln -sf /workspace/learnharness/scripts/lh.mjs ~/.local/bin/lh`. Check that `~/.local/bin` is on `PATH`. Without the link, run `node /workspace/learnharness/scripts/lh.mjs` wherever this guide says `lh`.
4. Start the server, bound to 127.0.0.1. First run both checks in step 5. If they pass, your LearnHarness is already running, so skip this step. Rerunning the start line empties the log, and the second server fails on the busy port. To restart, stop the old process first.

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
   - No API keys. `LH_IGNORE_ENV_KEYS=1` removes LearnHarness's key variables (`XAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` and the rest) from the server's environment. It leaves some provider tokens in place, and the second `unset` line clears those. It does not touch cloud credentials (`AWS_*`, `GOOGLE_APPLICATION_CREDENTIALS` or a gcloud login in `~/.config/gcloud`, `ANTHROPIC_FEDERATION_RULE_ID`), so start from a shell and an account that hold none. Keep no `.env` or `.env.local` file in the repo: `next dev` loads it after the shell `unset`. Add no key in Settings either. A bot-run lesson needs none.

5. Check it is up: `lh show no-such-lesson`. It prints `{"ok":false,"code":"not_found"}` and exits 1 when a LearnHarness answers. Exit 3 means it is not reachable yet. The first start compiles for a while, so read `/workspace/lh-server.log` and try again. Confirm the server is yours. `grep -E 'Local: +http://127\.0\.0\.1:3000' /workspace/lh-server.log` finds a line (use your port if you changed it). After `lh lesson new` (section 3), the lesson's file `/workspace/lh-data/chats/<lesson id>.json` exists.

`lh` talks to `LH_URL`, default `http://127.0.0.1:3000`. Use the IP, not `localhost`, which can resolve to the IPv6 address while the server listens on 127.0.0.1 only. To use another port, change `-p` and set `LH_URL` to match, for example `-p 3001` and `LH_URL=http://127.0.0.1:3001`.

## 2. How `lh` replies

Every command prints one JSON line and exits with a code:

| exit | meaning |
|---|---|
| 0 | ok: `{"ok":true,...}` |
| 1 | refused or bad input: `{"ok":false,"code":"...",...}` |
| 2 | `lh answer --wait` timed out: `{"ok":false,"error":"timeout"}` |
| 3 | LearnHarness unreachable: `{"ok":false,"code":"unreachable",...}`. Start it as in section 1. |

A reply with `"code":"bad_reply"` means LearnHarness answered with something other than JSON, such as an error page. Read `/workspace/lh-server.log`.

**The cursor.** Every reply about a lesson you can write to carries `cursor`, the id of the newest message in the lesson. A new lesson created without `--prompt` is empty, and its cursor is the lesson id. Pass the lesson id only when a reply gave it to you as the cursor. As `--after` it means "from the start": before your first turn on a lesson with a prompt it is refused as `unread_input`, and after that a turn that matches any earlier turn counts as a repeat and saves nothing. Every turn command needs `--after <cursor>`, and you pass the cursor from the last reply you read. In the examples, `L` is the lesson id and `C` is the cursor; after each reply, set `C` to its `cursor`.

**Items.** Learner input comes back as `items`. `lh answer` always has them. Other replies (a create, a repeat, a refusal, `lh show`) carry `items` when there is learner input you have not responded to. That is everything after your last turn, or everything since the lesson began if you have not taken a turn. A create with `--prompt` returns the prompt this way. Read the items in every reply that has them, and respond to all of them, before your next turn.

**Input.** `say` and `plan` read plain text. `ask`, `probe`, `recall`, `probe-done`, `quiz` and `explain` read one JSON object. Both come from `--file <path>` or stdin; the examples use a quoted heredoc (`<<'EOF'`), which keeps `$` and backticks literal. The JSON never carries `kind` or `after`. Those come from the command line.

## 3. Run a lesson

### Create it

```bash
lh lesson new --title "Binary search" --key binary-search-1 --prompt "I want to understand why binary search is fast."
```

```json
{"ok":true,"id":"<lesson id>","title":"Binary search","existing":false,"items":[{"type":"message","id":"<message id>","text":"I want to understand why binary search is fast."}],"cursor":"<message id>"}
```

Rerunning with the same key returns the same lesson with `"existing":true` and saves nothing, so a retried create never makes a duplicate. `--prompt` is the learner's request, saved as the first message. Open `http://127.0.0.1:3000/chat/<lesson id>` in your browser. That is the page the learner uses.

### Which kinds each phase takes

`lh show` reports the phase. A turn that does not fit is refused with `wrong_phase`, the current `phase`, and the kinds `allowed` now (section 5).

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

One question is open at a time. After a question, wait for the learner's answer or skip (section 4). Until then, turns are refused with `open_question`. Every question kind takes an optional `text` field: lead-in text shown above the question in the same message.

### Probe

Find the learner's goal with `ask`. Leave out `options` for a typed answer:

```bash
lh ask "$L" --after "$C" <<'EOF'
{"text":"Before we start, I'd like to know where you're headed.","question":"What do you want to be able to do with binary search?","options":[{"label":"Explain why it takes log n steps","value":"why-log-n"},{"label":"Write it without off-by-one bugs","value":"write-it"},{"label":"Both","value":"both"}]}
EOF
```

Measure what they already know with `probe` (multiple choice; `correctAnswer` is an option's `value`, and LearnHarness adds "I don't know" itself):

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

Reply to each answer with `say` (section 4), then ask the next question. When every strand the lesson depends on is bracketed, end the probe:

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

Then the map. `lh plan` reads a Mermaid graph. Node ids are permanent slugs: lowercase letters and digits, with single `-` or `_` between parts (`chain-rule`), and no leading, trailing or doubled separator, and `a --> b` means a must be understood before b:

```bash
lh plan "$L" --after "$C" <<'EOF'
graph TD
  sorted[Sorted order] --> halving[One comparison halves the range]
  halving --> count[Counting halvings]
  count --> logn[Why that count is log2 n]
EOF
```

A plan that does not parse, or has a cycle, is refused with `invalid` and the problems. If a node id appears twice, the first title given wins (a bare id gives no title). Send `plan` again whenever the map is wrong, in the plan or teach phase. The new map replaces the old one.

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

A `nodeId` that is not in the plan is refused with `invalid`. Teach between questions with `say`, one step at a time.

When the learner can do what their goal asked for (the last node of the plan), close the lesson with a `say` that sums up what they built.

## 4. Read learner input

### Items

```json
{"ok":true,"items":[{"type":"answer","id":"...","toolCallId":"...","kind":"quiz","question":"...","answers":[{"index":1,"label":"About 10"}],"dontKnow":false,"confidence":70,"correct":true}],"openQuestion":null,"cursor":"..."}
```

- `{"type":"message","id","text"}` is something the learner typed.
- `{"type":"answer",...}` is an answer. Its `kind` is `quiz` (from `probe` or `quiz`), `explain` (from `recall` or `explain`), or `ask`; `toolCallId` names the question. It carries `question`, `dontKnow`, and the picked `answers` as `index` and `label`, with no `value`. LearnHarness shuffles `probe` and `quiz` options, so `index` (from 1) is the order the learner saw, not your array's order. Match picks by `label`, so give every option a distinct label. It also carries whichever of these the page recorded: `text` (a typed answer: free recall, or an `ask` without options), `other` (the "Other" text), and `thinking` and `readingThinking` (their reasoning). A `probe` or `quiz` answer that picked an option has `correct` and `confidence` (one of 0, 30, 50, 70, 90, 100). With `dontKnow` true, `correct` is false and `confidence` is absent. The learner declined, which is not a wrong pick.
- `{"type":"skip","id","toolCallId","kind"}` is a skip. Re-ask or move on. To re-ask, send the question again with the cursor from the reply that carried the skip. With the question's old `--after`, it counts as a repeat (section 2) and saves nothing.

LearnHarness never grades free recall. For an answer of kind `explain`, compare `text` with the `correctAnswer` you committed (it is in the question's call in `lh show`), and give your grade in the next `say`. Grade against the committed answer as written.

`lh answer` only reads, so running it twice returns the same items, in order.

### Takeover

While the learner has taken over your browser, you are paused. They answer, skip, or type on the page, then click "I'm done", and you resume. On resume, run `lh answer "$L"` once and act on its items. Empty items mean they did nothing; ask them in Cursor what they want.

Use `--wait` only when the learner answers outside a takeover, while you keep running:

```bash
lh answer "$L" --wait --timeout 300
```

`--wait` takes no value. It checks every 2 s until there is at least one item, for 600 s unless `--timeout <seconds>` says otherwise. A timeout (exit 2) means the learner has not answered. Wait again, or ask them in Cursor.

## 5. Refusals and recovery

LearnHarness runs its checks before it saves anything, so a refused turn saved nothing. Fix it and resend. Refusals about a lesson carry the `cursor`; `not_found`, `not_bot_run`, `key_required`, `usage`, the `forbidden_*` codes, a create's `save_failed`, and a `--wait` timeout do not.

| code | what to do |
|---|---|
| `unread_input` | The learner added input after your cursor. Read `items`, take the new `cursor`, and respond to that input. |
| `open_question` | Wait for the open question's answer or skip. |
| `wrong_phase` | Use one of the kinds in `allowed`. |
| `invalid` | The payload failed the tool's checks. `problems` says what to fix. |
| `bad_after` | `--after` is not a message in this lesson. Use the reply's `cursor`, after reading its `items`. |
| `not_found` | No lesson with that id. |
| `not_bot_run` | The lesson belongs to LearnHarness's own model. Create your own with `lh lesson new`. |
| `key_required` | `lh lesson new` needs `--key`, which makes a rerun return the same lesson. |
| `usage` | `lh` rejected the command line before sending it: a missing flag, a misspelled flag, JSON that does not parse. |
| `save_failed` | The disk write failed. Rerun the same command. |
| `forbidden_origin`, `forbidden_host` | The request came from a browser, or through a non-loopback host name. Call through `lh` on this computer. |

**A lost reply.** If a turn's reply never arrives (a timeout, a crash), run `lh show "$L"` before you resend. If your turn is in `messages`, take the cursor from that reply and carry on. If not, resend the same turn with the same `--after`. When the first send did land, the resend returns `{"ok":true,"repeat":true,...}` and saves nothing. Resend the exact same content, because a reworded `say` counts as a new turn.

**Resuming a lesson.** `lh show "$L"` returns `phase`, `plan`, `openQuestion`, every message (questions keep their `toolCallId`), any unread `items`, and the `cursor`. That is enough to pick up after losing your memory, or to take over from another bot.

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

The input fields match the tools' fields. The prompts call the `readingThinking` field `thinkingWhileReading`. Where a prompt says "end your turn" after a question, wait for the learner's input.

`lh` has no equivalent for these tools: `research`, `demo`, `visual`, `pdf`, `find`, `ls`, `grep`, `read`, `list_sessions`, `list_propositions`. Where a prompt relies on one, use your own tools on this computer (your browser, your shell) and put what you learn into a `say`. With no `list_sessions` or `list_propositions`, you cannot see earlier lessons, so probe every strand.
