#!/bin/sh
# The same end-to-end job, run through the packaged AppImage instead of the source.
cd "$(dirname "$0")/.."
A=/tmp/p454-pk-$$-a; B=/tmp/p454-pk-$$-b; OUT=/tmp/p454-pk-result.json; SIM=/tmp/p454-pk-sim.json; DOUT=/tmp/p454-pk-design.json
rm -f "$OUT" "$SIM" "$DOUT"
setsid nohup socat pty,raw,echo=0,link=$A pty,raw,echo=0,link=$B >/dev/null 2>&1 < /dev/null &
sleep 0.7
setsid nohup node test/e2e-bridge.mjs $B $SIM >/tmp/p454-pk-bridge.log 2>&1 < /dev/null &
BRIDGE=$!
sleep 0.5
P454_SERIAL_PORTS=$A P454_AUTOPICK=1 P454_E2E=$(pwd)/test/e2e-page.js P454_E2E_OUT=$OUT P454_E2E_DESIGN=$(pwd)/test/e2e-design.js P454_E2E_DESIGN_OUT=$DOUT \
  timeout 200 xvfb-run -a ./dist/454-0.2.0.AppImage --appimage-extract-and-run --no-sandbox --disable-gpu >/tmp/p454-pk-electron.log 2>&1 || true
kill -TERM $BRIDGE 2>/dev/null || true; sleep 0.5
pkill -f "socat pty,raw,echo=0,link=$A" 2>/dev/null || true
