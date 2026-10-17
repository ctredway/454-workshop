// The soak test's controller: the simulated GRBL on the far end of a virtual serial port (as e2e-bridge.mjs), which
// also watches for STARVATION: the spindle running with nothing queued to do, because the next line hadn't arrived.
// On a real machine that's the cutter sitting still in the cut (burning wood) until the sender catches up.
//   node soak-bridge.mjs <port> <stats.json>    P454_SIM_SPEED=8 runs the machine 8x faster than real time
import { GrblSim } from '../../../packages/grbl/dist/index.js';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { SerialPort } = require('serialport');
const [path, outFile] = process.argv.slice(2);
const speed = Number(process.env.P454_SIM_SPEED || 1);
const sim = new GrblSim({ settings: { 22: 1 }, start: { x: -5, y: -5, z: -5 }, home: { x: -1, y: -1, z: -1 } });
let blocks = 0;
sim.timeline = { push: () => { blocks++; }, map: () => [] };          // hours of moves: count them, don't keep them
const port = new SerialPort({ path, baudRate: 115200 });
port.on('data', (b) => { bytesIn += b.length; sim.write(b.toString('latin1')); });
let bytesIn = 0, sent = 0, last = Date.now(), wallStart = Date.now();
const starve = { total: 0, count: 0, max: 0, cur: null, list: [] };
let cutting = 0, spindleOnSince = null;
const starved = () => sim.spindle.on && !sim.running && !sim.planner.length && !sim.rx.includes('\n') && !/Hold|Alarm/.test(sim.state);
setInterval(() => {
  const now = Date.now(); let dt = (now - last) / 1000 * speed; last = now;
  while (dt > 1e-9) {                                                  // small steps, so a gap is seen when it happens
    const d = Math.min(dt, 0.005); sim.step(d); dt -= d;
    if (sim.spindle.on) cutting += d;
    if (starved()) {
      if (!starve.cur) starve.cur = { at: sim.t, len: 0, line: sim.lineNo };
      starve.cur.len += d;
    } else if (starve.cur) {
      const g = starve.cur; starve.cur = null;
      starve.total += g.len; starve.count++; starve.max = Math.max(starve.max, g.len);
      if (g.len >= 0.05 && starve.list.length < 200) starve.list.push({ at: +g.at.toFixed(2), len: +g.len.toFixed(3), afterLine: g.line });
    }
  }
  while (sent < sim.out.length) port.write(sim.out[sent++] + '\r\n');
  if (sim.out.length > 5000) { sim.out.splice(0, sent); sent = 0; }  // don't keep hours of replies either
}, 10);
const save = () => writeFileSync(outFile, JSON.stringify({
  wallSeconds: (Date.now() - wallStart) / 1000, simSeconds: +sim.t.toFixed(1), speed, linesReceived: sim.lineNo, bytesIn, blocks,
  spindleOnSeconds: +cutting.toFixed(1), state: sim.state, spindle: sim.spindle, errors: sim.errors.slice(0, 50), errorCount: sim.errors.length,
  starvation: { totalSeconds: +starve.total.toFixed(3), gaps: starve.count, longestSeconds: +starve.max.toFixed(3), gapsOver50ms: starve.list },
}, null, 1));
setInterval(save, 5000);
process.on('SIGTERM', () => { save(); process.exit(0); }); process.on('SIGINT', () => { save(); process.exit(0); });
