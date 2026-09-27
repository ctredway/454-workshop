// The simulator must behave like GRBL 1.1 where 454 depends on it, or the safety tests prove nothing.
import { describe, it, expect } from 'vitest';
import { GrblSim, Streamer } from '../src/index.js';

const homedSim = (opts = {}) => { const s = new GrblSim(opts); s.write('$H\n'); s.step(5); s.out.length = 0; return s; };
const run = (s: GrblSim, secs: number) => { for (let i = 0; i < secs * 100; i++) s.step(0.01); };

describe('power-up, alarm and homing', () => {
  it('starts in Alarm with homing enabled, and refuses G-code until homed', () => {
    const s = new GrblSim();
    expect(s.state).toBe('Alarm');
    expect(s.out).toContain("[MSG:'$H'|'$X' to unlock]");
    s.write('G0 X-10\n');
    expect(s.out.at(-1)).toBe('error:9');
    s.write('$H\n'); s.step(5);
    expect(s.state).toBe('Idle'); expect(s.homed).toBe(true);
  });
});

describe('buffers', () => {
  it('answers ok as each line is accepted, but holds lines while the 15-block planner is full', () => {
    const s = homedSim();
    for (let i = 1; i <= 20; i++) s.write(`G1 X-${i * 10} F600\n`);
    expect(s.out.filter((l) => l === 'ok').length).toBe(15);       // five lines wait in the receive buffer
    run(s, 10);
    expect(s.out.filter((l) => l === 'ok').length).toBe(20);
  });
  it('notices a host overfilling the 128-byte receive buffer', () => {
    const s = homedSim();
    for (let i = 1; i <= 40; i++) s.write(`G1 X-${i} Y-${i} F100\n`);     // no waiting for ok: breaks character counting
    expect(s.errors.some((e) => e.includes('overflow'))).toBe(true);
  });
  it('character counting never overflows it, and every line is answered', () => {
    const s = homedSim(), lines = Array.from({ length: 400 }, (_, i) => `G1 X-${(i % 50) + 1}.123 Y-${(i % 37) + 1}.456 F3000`);
    const st = new Streamer(lines, (d) => s.write(d));
    let seen = 0;
    for (let k = 0; k < 200000 && !st.done; k++) {
      st.fill(); s.step(0.01);
      while (seen < s.out.length) st.onLine(s.out[seen++]);
    }
    expect(st.done).toBe(true); expect(st.answered).toBe(400); expect(s.errors).toEqual([]);
  });
});

describe('real-time commands', () => {
  it('feed hold decelerates to Hold:1, then settles in Hold:0; resume carries on', () => {
    const s = homedSim(); s.write('G1 X-300 F600\n'); run(s, 1);
    s.write('!'); s.write('?'); expect(s.out.at(-1)).toMatch(/^<Hold:1\|/);
    run(s, 0.5); s.write('?'); expect(s.out.at(-1)).toMatch(/^<Hold:0\|/);
    s.write('~'); run(s, 40); expect(s.state).toBe('Idle'); expect(s.mpos.x).toBeCloseTo(-300, 3);
  });
  it('a reset while moving raises ALARM:3 and loses position; a reset in Hold:0 does not', () => {
    const a = homedSim(); a.write('G1 X-300 F600\n'); run(a, 1); a.write('\x18');
    expect(a.out).toContain('ALARM:3'); expect(a.homed).toBe(false); expect(a.state).toBe('Alarm');
    const b = homedSim(); b.write('G1 X-300 F600\n'); run(b, 1); b.write('!'); run(b, 0.5); b.write('\x18');
    expect(b.out).not.toContain('ALARM:3'); expect(b.homed).toBe(true); expect(b.state).toBe('Idle');
  });
});

describe('commands GRBL refuses', () => {
  it('rejects M6 with error:20, as GRBL 1.1 does', () => { const s = homedSim(); s.write('M6 T2\n'); expect(s.out.at(-1)).toBe('error:20'); });
  it('rejects a move past the machine\'s travel with error:15 (soft limits)', () => { const s = homedSim(); s.write('G53 G0 X-900\n'); expect(s.out.at(-1)).toBe('error:15'); });
  it('rejects a feed move with no feed rate with error:22', () => { const s = homedSim(); s.write('G1 X-10\n'); expect(s.out.at(-1)).toBe('error:22'); });
});

describe('probing', () => {
  it('G38.2 stops on the switch and reports where', () => {
    const s = homedSim({ probe: { x: -10, y: -10, z: -60, radius: 1 } });
    s.write('G53 G0 X-10 Y-10\n'); s.write('G91 G38.2 Z-80 F300\n'); s.write('G90\n'); run(s, 30);
    expect(s.out.find((l) => l.startsWith('[PRB:'))).toBe('[PRB:-10.000,-10.000,-60.000:1]');
  });
  it('G38.2 that finds nothing raises ALARM:5', () => {
    const s = homedSim({ probe: null }); s.write('G91 G38.2 Z-20 F300\n'); run(s, 10);
    expect(s.out).toContain('ALARM:5');
  });
});

describe('spindle', () => {
  it('M3 and M5 take effect in order with the moves, not when received', () => {
    const s = homedSim(); s.write('G1 X-100 F600\n'); s.write('M3 S18000\n');
    expect(s.spindle.on).toBe(false);                             // still moving: the spindle waits its turn
    run(s, 20); expect(s.spindle).toEqual({ on: true, rpm: 18000 });
  });
});

describe('commands that wait for motion to finish (as GRBL\'s protocol_buffer_synchronize)', () => {
  it('M3 is answered only after the moves before it have finished', () => {
    const s = homedSim(); s.write('G1 X-100 F600\n'); s.write('M3 S18000\n');
    expect(s.out.filter((l) => l === 'ok').length).toBe(1);          // the move, not yet the M3
    run(s, 12); expect(s.out.filter((l) => l === 'ok').length).toBe(2);
  });
  it('G4 is answered only when the dwell is over, and holds the lines after it', () => {
    const s = homedSim(); s.write('G4 P3\n'); s.write('G1 X-10 F600\n');
    run(s, 1); expect(s.out.filter((l) => l === 'ok').length).toBe(0);
    run(s, 2.5); expect(s.out.filter((l) => l === 'ok').length).toBe(2);
  });
});
