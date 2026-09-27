#!/bin/sh
# The whole app, end to end: Electron (under a virtual screen) running 454 Control, its machine
# process, and the simulated controller on the far end of a virtual serial port.
set -e
cd "$(dirname "$0")/.."
A=/tmp/p454-e2e-$$-a; B=/tmp/p454-e2e-$$-b; OUT=/tmp/p454-e2e-result.json; SIM=/tmp/p454-e2e-sim.json; DOUT=/tmp/p454-e2e-design.json
rm -f "$OUT" "$SIM" "$DOUT" "$OUT.console" "$DOUT.console"
setsid nohup socat pty,raw,echo=0,link=$A pty,raw,echo=0,link=$B >/dev/null 2>&1 < /dev/null &
sleep 0.7
setsid nohup node test/e2e-bridge.mjs $B $SIM >/tmp/p454-e2e-bridge.log 2>&1 < /dev/null &
BRIDGE=$!
sleep 0.5
node scripts/build-app.js >/dev/null
P454_SERIAL_PORTS=$A P454_AUTOPICK=1 P454_E2E=test/e2e-page.js P454_E2E_OUT=$OUT P454_E2E_DESIGN=test/e2e-design.js P454_E2E_DESIGN_OUT=$DOUT \
  timeout 240 xvfb-run -a node_modules/.bin/electron . --no-sandbox --disable-gpu >/tmp/p454-e2e-electron.log 2>&1 || true
kill -TERM $BRIDGE 2>/dev/null || true; sleep 0.5
pkill -f "socat pty,raw,echo=0,link=$A" 2>/dev/null || true
echo "result: $OUT   simulator: $SIM"
