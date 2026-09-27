// The controller's end of a virtual serial port: the simulated GRBL, running in real time, with
// homing enabled as on a Shapeoko. Saves its timeline when stopped.
import { GrblSim } from '../../../packages/grbl/dist/index.js';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { SerialPort } = require('serialport');
const [path, outFile] = process.argv.slice(2);
const sim = new GrblSim({ settings: { 22: 1 }, start: { x: -5, y: -5, z: -5 }, home: { x: -1, y: -1, z: -1 } });
const port = new SerialPort({ path, baudRate: 115200 });
port.on('data', (b) => sim.write(b.toString('latin1')));
let sent = 0, last = Date.now();
setInterval(() => {
  const now = Date.now(); sim.step((now - last) / 1000); last = now;
  while (sent < sim.out.length) port.write(sim.out[sent++] + '\r\n');
}, 10);
const save = () => { writeFileSync(outFile, JSON.stringify({ errors: sim.errors, homed: sim.homed, state: sim.state, spindle: sim.spindle, mpos: sim.mpos, wco: sim.wco,
  timeline: sim.timeline.map((e) => ({ t: +e.t.toFixed(3), kind: e.kind, line: e.line, to: e.to, spindleOn: e.spindleOn, rpm: e.rpm, wco: e.wco })) }, null, 1)); process.exit(0); };
process.on('SIGTERM', save); process.on('SIGINT', save);
