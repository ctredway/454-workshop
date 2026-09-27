// The machine process's serial code, over a real (virtual) serial connection: socat links two
// pseudo-terminals, the simulated GRBL controller answers on one end, 454 talks to the other.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { GrblSim, Streamer } from '../../../packages/grbl/src/index.js';
const require = createRequire(import.meta.url);
const serial = require('../src/machine/serial.js');
const { SerialPort } = require('serialport');

const A = `/tmp/p454-${process.pid}-a`, B = `/tmp/p454-${process.pid}-b`;   // unique per run: no leftovers
let socat: ChildProcess, simPort: any, sim: GrblSim, timer: any;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  socat = spawn('socat', [`pty,raw,echo=0,link=${A}`, `pty,raw,echo=0,link=${B}`], { stdio: 'ignore', detached: false });
  for (let i = 0; i < 50 && !(existsSync(A) && existsSync(B)); i++) await wait(50);
  // the controller's end: bytes in go to the simulator, its replies go back out
  sim = new GrblSim({ settings: { 22: 0 } });
  simPort = new SerialPort({ path: B, baudRate: 115200 });
  await new Promise((r) => simPort.on('open', r));
  simPort.on('data', (b: Buffer) => sim.write(b.toString('latin1')));
  let sent = 0;
  timer = setInterval(() => {
    sim.step(0.02);
    while (sent < sim.out.length) simPort.write(sim.out[sent++] + '\r\n');
  }, 20);
});
afterAll(() => { clearInterval(timer); simPort?.close(); socat?.kill(); });

describe('serial connection to a (simulated) controller', () => {
  it('lists the port when told about it, opens it, and hears GRBL', async () => {
    process.env.P454_SERIAL_PORTS = A;
    const ports = await serial.list();
    expect(ports.some((p: any) => p.path === A)).toBe(true);
    const c = new serial.Connection(); let got = '';
    await c.open(A, 115200, (d: Uint8Array) => { got += Buffer.from(d).toString('latin1'); }, () => {});
    try {
      await c.write(new TextEncoder().encode('$$\n'));
      await wait(400);
      expect(got).toContain('$130=838');
      got = ''; await c.write(new Uint8Array([0x3f])); await wait(200);          // '?' status report
      expect(got).toMatch(/<Idle\|MPos:/);
    } finally { await c.close(); }
  });

  it('streams 300 lines with character counting, every one answered, nothing lost', async () => {
    const c = new serial.Connection(); let buf = ''; const replies: string[] = [];
    await c.open(A, 115200, (d: Uint8Array) => {
      buf += Buffer.from(d).toString('latin1');
      let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) replies.push(l); }
    }, () => {});
    const lines = Array.from({ length: 300 }, (_, i) => `G1 X-${(i % 40) + 1}.25 Y-${(i % 23) + 1}.5 F6000`);
    const before = sim.errors.length;
    const st = new Streamer(lines, (s) => { c.write(new TextEncoder().encode(s)); });
    let seen = 0;
    try {
      for (let k = 0; k < 4000 && !st.done; k++) { st.fill(); await wait(5); while (seen < replies.length) st.onLine(replies[seen++]); }
      expect(st.done).toBe(true);
      expect(st.answered).toBe(300);
      expect(st.errors).toEqual([]);
      expect(sim.errors.length).toBe(before);               // no overflow of the controller's buffer
    } finally { await c.close(); }
  });

  it('explains the errors people actually hit', () => {
    expect(serial.explain(new Error('Error: EACCES: permission denied'), '/dev/ttyACM0')).toMatch(process.platform === 'linux' ? /dialout/ : /EACCES/);
    expect(serial.explain(new Error('Error: Resource busy'), '/dev/ttyACM0')).toMatch(/in use by another program/);
  });
});
