#!/usr/bin/env bash
# Ticket 22: retake the committed 390 px card screenshots.
# Run from the repo root: bash .scratch/external-teacher/card-22/retake.sh
# Starts `next dev` on 127.0.0.1:3722 with a fresh data folder and no keys,
# builds each lesson with scripts/lh.mjs (JSON with `$` goes through --file),
# captures with shot.mjs, prints its report to /tmp/lh22-shot.txt, then stops
# the server it started. Every path is literal; nothing is removed by a
# computed name.
set -euo pipefail

S=.scratch/external-teacher/card-22
L=scripts/lh.mjs
export LH_URL=http://127.0.0.1:3722

# Safe to run twice: refuse to start over a server already on the port,
# and stop this script's server on any exit, failures included.
if ss -ltn | grep -q ":3722 "; then
	echo "port 3722 is in use; stop that server first" >&2
	exit 1
fi
# next dev rewrites AGENTS.md; restore exactly what was there before.
cp AGENTS.md /tmp/lh22-AGENTS.md
stop_server() {
	local child
	child=$(ss -ltnp | grep ":3722 " | grep -o "pid=[0-9]*" | cut -d= -f2 || true)
	if [ -f /tmp/lh22-server.pid ]; then kill "$(cat /tmp/lh22-server.pid)" 2> /dev/null || true; fi
	if [ -n "$child" ]; then kill "$child" 2> /dev/null || true; fi
	sleep 3
	if ss -ltn | grep -q ":3722 "; then echo "port 3722 still in use"; else echo "server stopped"; fi
	cp /tmp/lh22-AGENTS.md AGENTS.md
	rm -f ./.lh22-shot.mjs
	rm -rf /tmp/lh22-data
}
trap stop_server EXIT

rm -rf /tmp/lh22-data
mkdir -p /tmp/lh22-data

(
	unset LH_DESKTOP_SERVER LH_DESKTOP_API_SECRET
	LH_DATA_DIR=/tmp/lh22-data LH_IGNORE_ENV_KEYS=1 nohup npx next dev -H 127.0.0.1 -p 3722 > /tmp/lh22-server.log 2>&1 &
	echo $! > /tmp/lh22-server.pid
)

UP=0
for _ in $(seq 1 60); do
	if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3722/ | grep -q 200; then UP=1; break; fi
	sleep 3
done
if [ "$UP" != 1 ]; then echo "next dev did not come up; see /tmp/lh22-server.log" >&2; exit 1; fi

field() { node -pe "JSON.parse(require('fs').readFileSync(0)).$1"; }

# lesson <title> <key>: creates a lesson, prints "<id> <cursor>"
lesson() {
	local out
	out=$(node $L lesson new --title "$1" --key "$2" --prompt "Teach me logarithms")
	echo "$(echo "$out" | field id) $(echo "$out" | field cursor)"
}
# turn <kind> <id> <cursor> <file>: posts a turn, prints the new cursor
turn() { node $L "$1" "$2" --after "$3" --file "$4" | field cursor; }

read -r PROBE C < <(lesson "Halving and logs (probe)" card22-probe)
C=$(turn say "$PROBE" "$C" $S/say.txt); turn probe "$PROBE" "$C" $S/probe.json > /dev/null

read -r QUIZ C < <(lesson "Halving and logs (quiz)" card22-quiz)
C=$(turn probe-done "$QUIZ" "$C" $S/done.json); C=$(turn plan "$QUIZ" "$C" $S/plan.mmd)
C=$(turn say "$QUIZ" "$C" $S/say.txt); turn quiz "$QUIZ" "$C" $S/quiz.json > /dev/null

read -r PLAN9 C < <(lesson "Halving and logs (nine-node plan)" card22-plan9)
C=$(turn probe-done "$PLAN9" "$C" $S/done.json); C=$(turn plan "$PLAN9" "$C" $S/plan9.mmd)
C=$(turn say "$PLAN9" "$C" $S/say.txt); turn quiz "$PLAN9" "$C" $S/quiz.json > /dev/null

read -r WIDE C < <(lesson "Halving and logs (wide content)" card22-wide)
C=$(turn say "$WIDE" "$C" $S/wide-say.txt); turn probe "$WIDE" "$C" $S/wide-probe.json > /dev/null

read -r LONG C < <(lesson "Halving and logs (long word)" card22-long)
turn probe "$LONG" "$C" $S/longword-probe.json > /dev/null

read -r LINKS C < <(lesson "Links and a long code line" card22-links)
C=$(turn say "$LINKS" "$C" $S/links-say.txt); turn probe "$LINKS" "$C" $S/links-probe.json > /dev/null

read -r CHARTS C < <(lesson "Charts" card22-charts)
C=$(turn say "$CHARTS" "$C" $S/charts-say.txt); turn ask "$CHARTS" "$C" $S/charts-ask.json > /dev/null

read -r NONE C < <(lesson "Halving and logs (no question)" card22-none)
turn say "$NONE" "$C" $S/say.txt > /dev/null

# shot.mjs imports puppeteer-core, so it runs from the repo root.
cp $S/shot.mjs ./.lh22-shot.mjs
node ./.lh22-shot.mjs http://127.0.0.1:3722 $S probe="$PROBE" quiz="$QUIZ" plan9="$PLAN9" wide="$WIDE" longword="$LONG" links="$LINKS" charts="$CHARTS" none="$NONE" | tee /tmp/lh22-shot.txt
