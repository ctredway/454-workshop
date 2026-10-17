#!/bin/sh
# Soak test: 454 Control runs one long, dense job in the real desktop app against the simulated controller, while
# this script records the app's memory. See DEVELOPING.md. Settings (environment):
#   SOAK_MIN=30          the job's length, in machine minutes
#   P454_SIM_SPEED=1     the machine runs this many times faster than real time (the app keeps up, or doesn't)
#   SOAK_FEED=2500 SOAK_SEG=0.5   feed (mm/min) and move length (mm): 2500 and 0.5 is about 83 lines a second
#   SOAK_FREEZES='[{"at":120,"ms":3000}]'   freeze the page for ms milliseconds, at seconds into the job
#   SOAK_RENDER_FPS=10   draw the 3D view at most 10 times a second (on a test computer with no graphics card); -1 doesn't draw it at all
#   SOAK_HIDE=60:120     hide the window 60 s into the run, for 120 s (as when it's minimised)
#   SOAK_OUT=/tmp/p454-soak   where the results go (.json, -sim.json, -ps.log, .console)
set -e
cd "$(dirname "$0")/.."
MIN=${SOAK_MIN:-30}; SPEED=${P454_SIM_SPEED:-1}; OUT=${SOAK_OUT:-/tmp/p454-soak}
A=/tmp/p454-soak-$$-a; B=/tmp/p454-soak-$$-b
rm -f "$OUT.json" "$OUT-sim.json" "$OUT-ps.log" "$OUT.json.console"
CFG="{\"minutes\":$MIN,\"feed\":${SOAK_FEED:-2500},\"seg\":${SOAK_SEG:-0.5},\"sampleEvery\":${SOAK_SAMPLE:-15},\"freezes\":${SOAK_FREEZES:-[]},\"renderFps\":${SOAK_RENDER_FPS:-0}}"
sed "s|SOAK_CFG|$CFG|" test/e2e-soak.js > "$OUT-page.js"
setsid nohup socat pty,raw,echo=0,link=$A pty,raw,echo=0,link=$B >/dev/null 2>&1 < /dev/null &
sleep 0.7
P454_SIM_SPEED=$SPEED setsid nohup node test/soak-bridge.mjs $B "$OUT-sim.json" >"$OUT-bridge.log" 2>&1 < /dev/null &
BRIDGE=$!
node scripts/build-app.js >/dev/null
( while sleep 15; do                                       # memory of each of the app's processes, every 15 s
    ps -eo rss=,args= | awk -v t="$(date +%s)" '/electron/ && !/awk/ { k = /--type=renderer/ ? "renderer" : /--type=utility/ ? "machine" : /--type=gpu/ ? "gpu" : /--type=/ ? "other" : "main"; m[k] += $1 } END { for (k in m) printf "%s %s %d\n", t, k, m[k] / 1024 }' >> "$OUT-ps.log"
  done ) & PS=$!
LIMIT=$(( MIN * 60 / SPEED + 900 ))
env P454_SERIAL_PORTS=$A P454_AUTOPICK=1 P454_E2E="$OUT-page.js" P454_E2E_OUT="$OUT.json" P454_E2E_HIDE="${SOAK_HIDE:-}" \
  timeout $LIMIT xvfb-run -a node_modules/.bin/electron . --no-sandbox --disable-gpu --js-flags=--expose-gc >"$OUT-electron.log" 2>&1 || true
kill $PS 2>/dev/null || true
kill -TERM $BRIDGE 2>/dev/null || true; sleep 0.5
pkill -f "socat pty,raw,echo=0,link=$A" 2>/dev/null || true
echo "results: $OUT.json  machine: $OUT-sim.json  memory: $OUT-ps.log"
