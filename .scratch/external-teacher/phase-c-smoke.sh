#!/usr/bin/env bash
# Phase C smoke run (ticket 14). Starts LearnHarness with the start lines
# from docs/external-teacher.md section 1, with the data dir and log in a
# fresh temp directory, then teaches a scripted no-key lesson through `lh`
# using the guide's JSON examples as written. The learner's input goes
# through the page's own routes (POST /api/chat, the dismiss route).
#
# Usage: bash .scratch/external-teacher/phase-c-smoke.sh [port]
# Output: one block per step; the last line is PASS or FAIL with a count.
# It stops only the server it started (its process tree, by PID).
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${1:-3000}"
export LH_URL="http://127.0.0.1:$PORT"
TMP="$(mktemp -d /tmp/lh-phase-c-XXXXXX)"
DATA="$TMP/lh-data"
LOG="$TMP/lh-server.log"
LH=(node "$REPO/scripts/lh.mjs")
FAILS=0
SERVER_PID=""

say() { printf '\n== %s\n' "$*"; }
ok() { printf 'ok: %s\n' "$*"; }
bad() { printf 'FAIL: %s\n' "$*"; FAILS=$((FAILS + 1)); }

# kill_tree PID: the process and every descendant, children first.
kill_tree() {
	local pid=$1 child
	for child in $(ps -o pid= --ppid "$pid" 2>/dev/null); do kill_tree "$child"; done
	kill "$pid" 2>/dev/null
}
cleanup() {
	if [ -n "$SERVER_PID" ]; then kill_tree "$SERVER_PID"; fi
	if [ -n "${JUNK_PID:-}" ]; then kill_tree "$JUNK_PID"; fi
}
trap cleanup EXIT

# lh_run EXPECTED_EXIT JQ_CHECK ARGS... [<<< stdin]: runs lh, prints the
# command, reply and exit, then checks the exit code and a jq predicate
# on the reply. The reply is left in $OUT.
OUT=""
lh_run() {
	local want=$1 check=$2
	shift 2
	printf '$ lh %s\n' "$*"
	OUT="$("${LH[@]}" "$@")"
	local code=$?
	printf '%s\n[exit %s]\n' "$OUT" "$code"
	if [ "$code" != "$want" ]; then bad "lh $1: exit $code, want $want"; return 1; fi
	if ! jq -e "$check" >/dev/null 2>&1 <<<"$OUT"; then bad "lh $1: reply fails $check"; return 1; fi
	ok "lh $1 ($check)"
}
cursor() { C="$(jq -r .cursor <<<"$OUT")"; }

# page POST_PATH JSON: what the page sends, with the page's Origin.
page() {
	printf '$ page POST %s %s\n' "$1" "$2"
	local reply
	reply="$(curl -s -o /dev/stderr -w '%{http_code}' -X POST "$LH_URL$1" \
		-H 'Content-Type: application/json' -H "Origin: $LH_URL" --data "$2" 2>"$TMP/page.out")"
	printf '%s\n[http %s]\n' "$(head -c 400 "$TMP/page.out")" "$reply"
	if [ "$reply" = 200 ]; then ok "page POST $1"; else bad "page POST $1: http $reply"; fi
}
# page_answer ANSWER_JSON_WITHOUT_ANSWEREDAT: answers the open question
# through POST /api/chat the way the dock does ({chatId, input:{type:
# "answer", toolCallId, answer}}), taking toolCallId from GET /api/chats/:id
# like the page.
page_answer() {
	local call
	call="$(curl -s "$LH_URL/api/chats/$L" -H "Origin: $LH_URL" | jq -r '
		[.messages[] | select(.role=="assistant") | .content[] | select(.type=="toolCall") | .id] as $calls
		| [.messages[] | select(.role=="toolResult") | .toolCallId] as $done
		| ($calls - $done) | last')"
	page /api/chat "$(jq -nc --arg L "$L" --arg t "$call" --argjson a "$1" \
		'{chatId:$L, input:{type:"answer", toolCallId:$t, answer:($a + {answeredAt:(now|todate)})}}')"
}

cd "$REPO" || exit 1
echo "repo $REPO, port $PORT, temp $TMP"
echo "commit $(git rev-parse HEAD)"
echo "node $(node -v)"

say "1. Start LearnHarness (guide section 1, step 4; paths under $TMP)"
if ss -ltn | grep -q "[:.]$PORT "; then echo "port $PORT is busy; pass another port"; exit 1; fi
unset LH_DESKTOP_SERVER LH_DESKTOP_API_SECRET
unset ANTHROPIC_AUTH_TOKEN ANTHROPIC_OAUTH_TOKEN AZURE_OPENAI_API_KEY GOOGLE_CLOUD_API_KEY CLOUDFLARE_API_KEY COPILOT_GITHUB_TOKEN
mkdir -p "$DATA"
LH_DATA_DIR="$DATA" LH_IGNORE_ENV_KEYS=1 nohup npx next dev -H 127.0.0.1 -p "$PORT" > "$LOG" 2>&1 &
SERVER_PID=$!
echo "server pid $SERVER_PID"
ls -a "$REPO" | grep -E '^\.env' && bad ".env file in the repo" || ok "no .env* file in the repo"

say "2. Wait until lh show no-such-lesson exits 1 (guide section 1, step 5)"
for _ in $(seq 1 120); do
	"${LH[@]}" show no-such-lesson >/dev/null 2>&1
	[ $? = 1 ] && break
	sleep 3
done
lh_run 1 '.ok==false and .code=="not_found"' show no-such-lesson
printf '$ grep -E %s %s\n' "'Local: +http://127\\.0\\.0\\.1:$PORT'" "$LOG"
grep -E "Local: +http://127\.0\.0\.1:$PORT" "$LOG" && ok "log shows the loopback Local line" || bad "no Local line in the log"

printf '$ ln -sf %s %s; lh show no-such-lesson (through the link)\n' "$REPO/scripts/lh.mjs" "$TMP/bin/lh"
mkdir -p "$TMP/bin" && ln -sf "$REPO/scripts/lh.mjs" "$TMP/bin/lh"
OUT="$("$TMP/bin/lh" show no-such-lesson)"; code=$?
printf '%s\n[exit %s]\n' "$OUT" "$code"
[ "$code" = 1 ] && jq -e '.code=="not_found"' >/dev/null <<<"$OUT" && ok "lh runs through a symlink (guide step 3)" || bad "lh through a symlink"

say "3. The port is loopback-only"
ss -ltnp 2>/dev/null | grep "[:.]$PORT " || true
if ss -ltn | awk '{print $4}' | grep -E "[:.]$PORT\$" | grep -vqE "^127\.0\.0\.1:"; then
	bad "something listens on $PORT beyond 127.0.0.1"
else ok "only 127.0.0.1:$PORT listens"; fi
for ip in $(hostname -I); do
	printf '$ curl http://%s:%s/\n' "$ip" "$PORT"
	curl -s -m 5 -o /dev/null "http://$ip:$PORT/"
	code=$?
	echo "[curl exit $code]"
	if [ "$code" = 7 ]; then ok "$ip:$PORT refuses the connection"; else bad "$ip:$PORT answered or hung (curl exit $code)"; fi
done
printf '$ curl -H "Host: example.com" %s/api/external/chats/x\n' "$LH_URL"
body="$(curl -s -H 'Host: example.com' "$LH_URL/api/external/chats/x")"
echo "$body"
jq -e '.code=="forbidden_host"' >/dev/null <<<"$body" && ok "forged Host is refused" || bad "forged Host was not refused"
printf '$ curl -H "Origin: http://evil.example" %s/api/external/chats/x\n' "$LH_URL"
body="$(curl -s -H 'Origin: http://evil.example' "$LH_URL/api/external/chats/x")"
echo "$body"
jq -e '.code=="forbidden_origin"' >/dev/null <<<"$body" && ok "browser Origin is refused" || bad "browser Origin was not refused"

say "4. Exit 3 and usage refusals (guide section 2, section 5)"
printf '$ LH_URL=http://127.0.0.1:9 lh show x\n'
OUT="$(LH_URL=http://127.0.0.1:9 "${LH[@]}" show x)"; code=$?
printf '%s\n[exit %s]\n' "$OUT" "$code"
[ "$code" = 3 ] && jq -e '.code=="unreachable" and (.error|test("is not reachable")) and .guide=="docs/external-teacher.md"' >/dev/null <<<"$OUT" \
	&& ok "unreachable: exit 3" || bad "unreachable reply"
lh_run 1 '.code=="key_required"' lesson new --title "No key"
lh_run 1 '.code=="usage"' say x --text hi
lh_run 1 '.code=="usage"' say x <<<"no after"
lh_run 1 '.code=="usage"' probe x --after y <<<'{not json'
lh_run 1 '.code=="usage"' answer x --timeout 5
lh_run 1 '.code=="usage"' frobnicate

say "5. Create the lesson (guide section 3)"
lh_run 0 '.ok and .existing==false and .title=="Binary search" and (.items|length)==1 and .items[0].type=="message" and .items[0].text=="I want to understand why binary search is fast." and .cursor==.items[0].id' \
	lesson new --title "Binary search" --key binary-search-1 --prompt "I want to understand why binary search is fast."
L="$(jq -r .id <<<"$OUT")"; cursor
lh_run 0 ".existing==true and .id==\"$L\"" lesson new --title "Binary search" --key binary-search-1 --prompt "I want to understand why binary search is fast."
[ -f "$DATA/chats/$L.json" ] && ok "chats/$L.json exists" || bad "no chats/$L.json"
code="$(curl -s -o /dev/null -w '%{http_code}' "$LH_URL/chat/$L")"
[ "$code" = 200 ] && ok "page /chat/$L answers 200" || bad "page /chat/$L: http $code"
lh_run 1 ".code==\"unread_input\" and (.items|length)==1 and .cursor==\"$C\"" say "$L" --after "$L" <<<"Hello."
lh_run 0 '.phase=="probe" and .plan==null and .openQuestion==null' show "$L"

say "6. Probe: ask, probe, recall, probe-done (guide JSON as written)"
lh_run 0 '.ok' ask "$L" --after "$C" <<'EOF'
{"text":"Before we start, I'd like to know where you're headed.","question":"What do you want to be able to do with binary search?","options":[{"label":"Explain why it takes log n steps","value":"why-log-n"},{"label":"Write it without off-by-one bugs","value":"write-it"},{"label":"Both","value":"both"}]}
EOF
cursor; ASKED_AT="$C"
lh_run 1 '.code=="open_question"' say "$L" --after "$C" <<<"Too soon."
page_answer '{"kind":"ask","questionText":"What do you want to be able to do with binary search?","dontKnow":false,"answers":[{"index":1,"label":"Explain why it takes log n steps","value":"why-log-n"}]}'
lh_run 0 '(.items|length)==1 and .items[0].type=="answer" and .items[0].kind=="ask" and .items[0].answers==[{"index":1,"label":"Explain why it takes log n steps"}]' answer "$L"
FIRST="$OUT"
lh_run 0 '.ok' answer "$L"
[ "$(jq -c .items <<<"$FIRST")" = "$(jq -c .items <<<"$OUT")" ] && ok "answer twice returns the same items" || bad "answer twice differed"
lh_run 0 '(.items|length)==1' answer "$L" --wait --timeout 5
cursor
lh_run 1 '.code=="unread_input"' say "$L" --after "$ASKED_AT" <<<"Thanks."
lh_run 1 '.code=="bad_after"' say "$L" --after no-such-message <<<"Thanks."
lh_run 0 '.ok and (.repeat|not)' say "$L" --after "$C" <<<"Good goal. Let's see what you already know."
SAID_AFTER="$C"; cursor
lh_run 0 '.ok and .repeat==true' say "$L" --after "$SAID_AFTER" <<<"Good goal. Let's see what you already know."
lh_run 0 '(.items|length)==0' answer "$L"
printf '$ lh answer %s --wait --timeout 3\n' "$L"
OUT="$("${LH[@]}" answer "$L" --wait --timeout 3)"; code=$?
printf '%s\n[exit %s]\n' "$OUT" "$code"
[ "$code" = 2 ] && [ "$OUT" = '{"ok":false,"error":"timeout"}' ] && ok "--wait timeout: exit 2" || bad "--wait timeout reply"
lh_run 1 '.code=="wrong_phase" and .phase=="probe" and (.allowed|index("probe")) and (.allowed|index("quiz")|not)' quiz "$L" --after "$C" <<'EOF'
{"type":"predict","nodeId":"halving","question":"Too early?","options":[{"label":"A","value":"a"},{"label":"B","value":"b"}],"explanation":"x","correctAnswer":"a"}
EOF

lh_run 0 '.ok' probe "$L" --after "$C" <<'EOF'
{"question":"Binary search on 1,000 sorted items takes at most about how many comparisons?","options":[{"label":"About 10","value":"ten"},{"label":"About 100","value":"hundred"},{"label":"About 500","value":"five-hundred"}],"explanation":"Each comparison halves the range, and 2^10 = 1024, so about 10 halvings reach one item.","correctAnswer":"ten"}
EOF
lh_run 0 '.openQuestion.tool=="probe"' show "$L"
page_answer '{"kind":"quiz","tool":"probe","questionText":"Binary search on 1,000 sorted items takes at most about how many comparisons?","options":[{"index":1,"label":"About 100"},{"index":2,"label":"About 10"},{"index":3,"label":"About 500"},{"index":4,"label":"I don'"'"'t know"}],"dontKnow":false,"answers":[{"index":2,"label":"About 10","value":"ten"}],"thinking":"2^10 is about 1000","confidence":70,"correct":true,"correctIndices":[2],"explanation":"Each comparison halves the range, and 2^10 = 1024, so about 10 halvings reach one item."}'
lh_run 0 '.items[0].kind=="quiz" and .items[0].answers==[{"index":2,"label":"About 10"}] and .items[0].correct==true and .items[0].confidence==70 and .items[0].thinking=="2^10 is about 1000" and .items[0].dontKnow==false' answer "$L"
cursor
lh_run 0 '.ok' say "$L" --after "$C" <<<"Right: about 10."
cursor

printf '%s\n' '{"question":"Why does binary search need the list to be sorted?","correctAnswer":"Each step compares the target with the middle item and throws away the half that cannot contain it. Only sorted order guarantees that everything in the discarded half is on the wrong side of the target."}' > "$TMP/recall.json"
lh_run 0 '.ok' recall "$L" --after "$C" --file "$TMP/recall.json"
page_answer '{"kind":"explain","tool":"recall","questionText":"Why does binary search need the list to be sorted?","dontKnow":false,"answers":[],"text":"So you can throw away the half that is on the wrong side."}'
lh_run 0 '.items[0].kind=="explain" and .items[0].text=="So you can throw away the half that is on the wrong side."' answer "$L"
cursor
lh_run 0 '.ok' say "$L" --after "$C" <<<"That matches the answer I committed."
cursor

lh_run 1 '.code=="invalid"' probe-done "$L" --after "$C" <<'EOF'
{"text":"Lead-in is refused here.","assessment":{"strands":[{"strand":"Sorted order","assessment":"Solid."}],"summary":"x"}}
EOF
lh_run 0 '.ok' probe-done "$L" --after "$C" <<'EOF'
{"assessment":{"strands":[{"strand":"Sorted order","assessment":"Solid: knows binary search needs sorted input and why."},{"strand":"Logarithms","assessment":"Floor: knows 2^10 is about 1000. Ceiling: cannot connect halving to log2 n."}],"summary":"Goal: explain why binary search takes log n steps. Start from repeated halving."}}
EOF
cursor
lh_run 0 '.phase=="plan"' show "$L"

say "7. Plan (guide JSON as written)"
lh_run 1 '.code=="wrong_phase" and .phase=="plan"' probe "$L" --after "$C" <<'EOF'
{"question":"Late probe?","options":[{"label":"A","value":"a"},{"label":"B","value":"b"}],"explanation":"x","correctAnswer":"a"}
EOF
lh_run 1 '.code=="invalid" and (.problems|tostring|test("plan_init"))' quiz "$L" --after "$C" <<'EOF'
{"type":"predict","nodeId":"halving","text":"Let's start at the first node.","question":"You compare the target with the middle of 16 sorted items and it is smaller. How many items can still hold the target?","options":[{"label":"7 or 8","value":"half"},{"label":"15","value":"all-but-one"},{"label":"16","value":"all"}],"explanation":"Everything from the middle up is larger than the target, so only the lower half is left.","correctAnswer":"half"}
EOF
lh_run 0 '.ok' say "$L" --after "$C" <<'EOF'
You already know why the list must be sorted. We'll build from halving: what one comparison throws away, how many halvings reach one item, and why that count is log2 n.
EOF
cursor
lh_run 1 '.code=="invalid"' plan "$L" --after "$C" <<'EOF'
graph TD
  a --> b
  b --> a
EOF
lh_run 0 '.ok' plan "$L" --after "$C" <<'EOF'
graph TD
  sorted[Sorted order] --> halving[One comparison halves the range]
  halving --> count[Counting halvings]
  count --> logn[Why that count is log2 n]
EOF
cursor
lh_run 0 '.phase=="plan" and .plan!=null' show "$L"
lh_run 0 '.ok' ask "$L" --after "$C" <<'EOF'
{"question":"Does this plan work for you?","options":[{"label":"Yes, let's start","value":"yes"},{"label":"I'd like to change something","value":"change"}]}
EOF
page_answer '{"kind":"ask","questionText":"Does this plan work for you?","dontKnow":false,"answers":[{"index":1,"label":"Yes, let'"'"'s start","value":"yes"}]}'
lh_run 0 '.items[0].answers[0].label=="Yes, let'"'"'s start"' answer "$L"
cursor

say "8. Teach: quiz, then an answer through POST /api/chat, lh answer, lh show"
lh_run 1 '.code=="invalid" and (.problems|tostring|test("halving|logn|sorted|count"))' quiz "$L" --after "$C" <<'EOF'
{"type":"predict","nodeId":"no-such-node","question":"Which node?","options":[{"label":"A","value":"a"},{"label":"B","value":"b"}],"explanation":"x","correctAnswer":"a"}
EOF
lh_run 0 '.ok' quiz "$L" --after "$C" <<'EOF'
{"type":"predict","nodeId":"halving","text":"Let's start at the first node.","question":"You compare the target with the middle of 16 sorted items and it is smaller. How many items can still hold the target?","options":[{"label":"7 or 8","value":"half"},{"label":"15","value":"all-but-one"},{"label":"16","value":"all"}],"explanation":"Everything from the middle up is larger than the target, so only the lower half is left.","correctAnswer":"half"}
EOF
QUIZ_AFTER="$C"
lh_run 0 '.phase=="teach" and .openQuestion.tool=="quiz"' show "$L"
page_answer '{"kind":"quiz","tool":"quiz","questionType":"predict","questionText":"You compare the target with the middle of 16 sorted items and it is smaller. How many items can still hold the target?","options":[{"index":1,"label":"16"},{"index":2,"label":"7 or 8"},{"index":3,"label":"15"},{"index":4,"label":"I don'"'"'t know"}],"dontKnow":false,"answers":[{"index":3,"label":"15","value":"all-but-one"}],"confidence":50,"correct":false,"correctIndices":[2],"explanation":"Everything from the middle up is larger than the target, so only the lower half is left."}'
lh_run 0 '(.items|length)==1 and .items[0].kind=="quiz" and .items[0].correct==false and .items[0].confidence==50 and .items[0].answers==[{"index":3,"label":"15"}] and .openQuestion==null' answer "$L"
cursor
lh_run 0 '.ok' say "$L" --after "$C" <<<"Not quite: everything from the middle up is larger, so only the lower half is left."
cursor
lh_run 0 '.ok and .repeat==true' quiz "$L" --after "$QUIZ_AFTER" <<'EOF'
{"type":"predict","nodeId":"halving","text":"Let's start at the first node.","question":"You compare the target with the middle of 16 sorted items and it is smaller. How many items can still hold the target?","options":[{"label":"7 or 8","value":"half"},{"label":"15","value":"all-but-one"},{"label":"16","value":"all"}],"explanation":"Everything from the middle up is larger than the target, so only the lower half is left.","correctAnswer":"half"}
EOF
lh_run 0 '.ok' explain "$L" --after "$C" <<'EOF'
{"type":"check","nodeId":"logn","question":"In your own words, why does binary search on n items take about log2 n steps?","correctAnswer":"Each step halves the remaining range. After k steps n/2^k items remain, and the search ends when that reaches 1, so k = log2 n."}
EOF
SKIP_AFTER="$C"
call="$(curl -s "$LH_URL/api/chats/$L" | jq -r '[.messages[] | select(.role=="assistant") | .content[] | select(.type=="toolCall") | .id] | last')"
page "/api/chats/$L/dismiss" "$(jq -nc --arg t "$call" '{input:{type:"dismiss",toolCallId:$t,answer:{kind:"explain",questionText:"In your own words, why does binary search on n items take about log2 n steps?",dontKnow:false,answers:[],dismissed:true,answeredAt:(now|todate)}}}')"
lh_run 0 "(.items|length)==1 and .items[0].type==\"skip\" and .items[0].kind==\"explain\" and .items[0].toolCallId==\"$call\"" answer "$L"
cursor
lh_run 0 '.ok and .repeat==true' explain "$L" --after "$SKIP_AFTER" <<'EOF'
{"type":"check","nodeId":"logn","question":"In your own words, why does binary search on n items take about log2 n steps?","correctAnswer":"Each step halves the remaining range. After k steps n/2^k items remain, and the search ends when that reaches 1, so k = log2 n."}
EOF
lh_run 0 '.ok and (.repeat|not)' explain "$L" --after "$C" <<'EOF'
{"type":"check","nodeId":"logn","question":"In your own words, why does binary search on n items take about log2 n steps?","correctAnswer":"Each step halves the remaining range. After k steps n/2^k items remain, and the search ends when that reaches 1, so k = log2 n."}
EOF
page_answer '{"kind":"explain","tool":"explain","questionType":"check","questionText":"In your own words, why does binary search on n items take about log2 n steps?","dontKnow":false,"answers":[],"text":"Each step halves it, so you can only halve log2 n times."}'
page /api/chat "$(jq -nc --arg L "$L" '{chatId:$L, input:{type:"text", text:"can we slow down?"}}')"
lh_run 0 '(.items|length)==2 and .items[0].kind=="explain" and .items[1].type=="message" and .items[1].text=="can we slow down?"' answer "$L"
cursor
lh_run 0 '.ok' say "$L" --after "$C" <<<"Yes. You built it: each comparison halves the range, so n items need about log2 n steps."
cursor
lh_run 0 ".phase==\"teach\" and .openQuestion==null and (.items|length)==0 and .cursor==\"$C\" and (.plan|tostring|test(\"logn\")) and ([.messages[].calls[]?.tool]|index(\"probe_done\")) and ([.messages[]|select(.role==\"toolResult\")]|length)>=8" show "$L"

say "9. Other lessons: empty create, not_bot_run, bad_reply"
lh_run 0 '.ok and .existing==false and .cursor==.id and ((.items // [])|length)==0' lesson new --title "Empty" --key empty-1
E="$(jq -r .id <<<"$OUT")"
lh_run 0 '.ok' say "$E" --after "$E" <<<"Hello, where shall we start?"
model="$(curl -s -X POST "$LH_URL/api/chats" -H 'Content-Type: application/json' -H "Origin: $LH_URL" --data '{"title":"model lesson"}' | jq -r .id)"
echo "model lesson $model"
lh_run 1 '.code=="not_bot_run"' show "$model"
mkdir -p "$TMP/junk" && echo '<html>not json</html>' > "$TMP/junk/index.html"
JPORT=$((PORT + 17))
python3 -m http.server "$JPORT" --bind 127.0.0.1 --directory "$TMP/junk" >/dev/null 2>&1 &
JUNK_PID=$!
sleep 1
printf '$ LH_URL=http://127.0.0.1:%s lh show x\n' "$JPORT"
OUT="$(LH_URL="http://127.0.0.1:$JPORT" "${LH[@]}" show x)"; code=$?
printf '%s\n[exit %s]\n' "$OUT" "$code"
[ "$code" = 1 ] && jq -e '.code=="bad_reply"' >/dev/null <<<"$OUT" && ok "bad_reply: exit 1" || bad "bad_reply reply"

say "9b. Answers outside the page: lh submit (ticket 21)"
lh_run 0 '.ok' lesson new --title "Submit" --key submit-1 --prompt "Binary search, from my phone."
S="$(jq -r .id <<<"$OUT")"; cursor
lh_run 0 '.ok' probe "$S" --after "$C" <<'EOF'
{"question":"Binary search on 1,000 sorted items takes at most about how many comparisons?","options":[{"label":"About 10","value":"ten"},{"label":"About 100","value":"hundred"},{"label":"About 500","value":"five-hundred"}],"explanation":"Each comparison halves the range, and 2^10 = 1024, so about 10 halvings reach one item.","correctAnswer":"ten"}
EOF
cursor
code="$(curl -s -o "$TMP/card.html" -w '%{http_code}' "$LH_URL/chat/$S/card")"
[ "$code" = 200 ] && grep -q "About 10" "$TMP/card.html" && ok "card /chat/$S/card answers 200 with the question" || bad "card: http $code"
lh_run 1 '.code=="invalid" and (.problems|tostring|test("confidence")) and (.options|length)==3' submit "$S" --after "$C" <<'EOF'
{"picks":[1]}
EOF
N="$(jq -r '.options[] | select(.label=="About 10") | .number' <<<"$OUT")"
CARD_N="$(sed 's/<li /\n<li /g' "$TMP/card.html" | grep 'data-testid="card-option"' | grep '<p>About 10</p>' | sed -E 's/.*data-number="([0-9]+)".*/\1/')"
echo "card number of About 10: lh $N, card page $CARD_N"
[ -n "$N" ] && [ "$N" = "$CARD_N" ] && ok "lh submit numbers options as the card page does" || bad "lh submit's number ($N) differs from the card's ($CARD_N)"
lh_run 1 '.code=="usage"' submit "$S" --after "$C" <<'EOF'
{"picks":[null],"confidence":70}
EOF
lh_run 0 '.ok' show "$S"
[ "$(jq '[.messages[]|select(.role=="toolResult")]|length' <<<"$OUT")" = 0 ] && ok "refused submits saved nothing" || bad "a refused submit saved something"
printf '{"picks":[%s],"confidence":70,"thinking":"2^10 is about 1000, so $n$ halves to 1 in $k$ steps"}\n' "$N" > "$TMP/submit.json"
lh_run 0 ".repeat==false and .items[0].type==\"answer\" and .items[0].answers==[{\"index\":$N,\"label\":\"About 10\"}] and .items[0].correct==true and .items[0].confidence==70 and (.items[0].thinking|test(\"[$]n[$]\")) and .openQuestion==null" submit "$S" --after "$C" --file "$TMP/submit.json"
SUBMIT_CURSOR="$(jq -r .cursor <<<"$OUT")"
lh_run 0 ".repeat==true and .cursor==\"$SUBMIT_CURSOR\"" submit "$S" --after "$C" --file "$TMP/submit.json"
lh_run 0 '.ok' show "$S"
[ "$(jq '[.messages[]|select(.role=="toolResult")]|length' <<<"$OUT")" = 1 ] && ok "the retry saved nothing" || bad "the retry saved a second answer"
lh_run 1 '.code=="answered"' submit "$S" --after "$C" <<'EOF'
{"dontKnow":true}
EOF
lh_run 0 '(.items|length)==1 and .items[0].correct==true' answer "$S"
cursor
lh_run 0 '.ok' say "$S" --after "$C" <<<"Right: about 10."
cursor
lh_run 0 '.ok' recall "$S" --after "$C" <<'EOF'
{"question":"Why does binary search need the list to be sorted?","correctAnswer":"Each step compares the target with the middle item and throws away the half that cannot contain it."}
EOF
cursor
lh_run 0 '.items[0].kind=="explain" and .items[0].text=="So the half you drop cannot hold it."' submit "$S" --after "$C" <<'EOF'
{"text":"So the half you drop cannot hold it."}
EOF
cursor
lh_run 0 '.ok' say "$S" --after "$C" <<<"That matches the answer I committed."
cursor
lh_run 0 '.ok' probe "$S" --after "$C" <<'EOF'
{"question":"Which list can binary search use?","options":[{"label":"1, 3, 7, 9","value":"sorted"},{"label":"9, 1, 7, 3","value":"unsorted"}],"explanation":"Only sorted order lets each comparison rule out a half.","correctAnswer":"sorted"}
EOF
cursor
lh_run 0 '.items[0].type=="answer" and .items[0].dontKnow==true and (.items[0]|has("confidence")|not)' submit "$S" --after "$C" <<'EOF'
{"dontKnow":true}
EOF
cursor
lh_run 0 '.ok' say "$S" --after "$C" <<<"No problem; sorted order is what lets each step drop a half."
cursor
lh_run 0 '.ok' ask "$S" --after "$C" <<'EOF'
{"question":"Shall we go on?","options":[{"label":"Yes","value":"yes"},{"label":"Later","value":"later"}]}
EOF
cursor
lh_run 0 '.items[0].type=="skip" and .items[0].kind=="ask" and .openQuestion==null' submit "$S" --after "$C" --skip
lh_run 0 '.repeat==true' submit "$S" --after "$C" --skip

say "10. No model ran"
printf '$ grep -iE "agent|provider|api key|error" %s\n' "$LOG"
grep -iE "agent|provider|api key|error" "$LOG" || echo "(no matches)"
grep -qiE "turn refused|models_not_configured|Error:" "$LOG" && bad "the server log shows a model turn or an error" || ok "the server log shows no model turn and no error"

echo
if [ "$FAILS" = 0 ]; then echo "PASS"; else echo "FAIL: $FAILS check(s)"; fi
exit $((FAILS > 0))
