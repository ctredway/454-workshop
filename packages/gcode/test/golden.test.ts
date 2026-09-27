import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseGcode, cleanForSend } from '../src/index.js';

// What 454 Control produced for each of these real jobs. The package must match exactly:
// every segment, the timing, the extents, the tools, the issues and the toolpath names.
const dir = new URL('./fixtures/', import.meta.url);
const files = ['r1.gcode', 'r1-454cam.gcode', 'RearArmInsertsUpdated.gcode', 'r1-converted-by-454.nc'];

function fingerprint(r: ReturnType<typeof parseGcode>) {
  const h = createHash('sha256');
  for (const s of r.segs)
    h.update([s.x0, s.y0, s.z0, s.x1, s.y1, s.z1].map((v) => v.toFixed(6)).join(',') + '|' + (s.rapid ? 1 : 0) + '|' + s.line +
             '|' + (s.feed === null ? '-' : s.feed.toFixed(4)) + '|' + s.tool + '\n');
  const xs = r.segs.flatMap((s) => [s.x0, s.x1]), ys = r.segs.flatMap((s) => [s.y0, s.y1]), zs = r.segs.flatMap((s) => [s.z0, s.z1]);
  const r6 = (v: number) => +v.toFixed(6);
  return {
    segments: r.segs.length, segmentsHash: h.digest('hex'),
    totalTime: r6(r.totalTime), cutDist: r6(r.cutDist), rapidDist: r6(r.rapidDist),
    extents: { x: [r6(Math.min(...xs)), r6(Math.max(...xs))], y: [r6(Math.min(...ys)), r6(Math.max(...ys))], z: [r6(Math.min(...zs)), r6(Math.max(...zs))] },
    tools: r.tools.map((t) => ({ line: t.line, tool: t.tool })),
    issues: r.issues.map((i) => i.sev + '@' + i.line + ': ' + i.msg),
    sections: (r.sections ?? []).map((s) => ({ line: s.line, name: s.name, tool: s.tool ?? null })),
  };
}

describe('parser matches 454 Control on real jobs', () => {
  for (const f of files) {
    it(f, () => {
      const text = readFileSync(new URL(f, dir), 'utf8');
      const expected = JSON.parse(readFileSync(new URL(f + '.expected.json', dir), 'utf8'));
      expect(fingerprint(parseGcode(text, { rapidRate: 5000 }))).toEqual(expected);
    });
  }
});

describe('comments', () => {
  it('strips nested parentheses without leaving a stray bracket to send', () => {
    expect(cleanForSend('G1 X1 (Tool: End Mill (2 mm)) Y2').replace(/\s+/g, ' ').trim()).toBe('G1 X1 Y2');
    expect(cleanForSend(';Toolpath: Holes').trim()).toBe('');
  });
});

describe('what the machine side relies on', () => {
  it('reads a spindle start written with no space, "M3S20000"', () => {
    const r = parseGcode('G21\nG90\nM3S20000\nG0Z5\nG1Z-1F200', { rapidRate: 5000 });
    expect(r.issues.find((i) => /before the spindle is started/.test(i.msg))).toBeUndefined();
  });
  it('flags a feed move before any feed rate', () => {
    const r = parseGcode('G21\nG90\nM3S1000\nG1X10', { rapidRate: 5000 });
    expect(r.issues.some((i) => i.sev === 'err' && /no feed rate/.test(i.msg))).toBe(true);
  });
  it('flags canned cycles, which GRBL cannot run', () => {
    const r = parseGcode('G21\nG90\nG81 X1 Y1 Z-2 R1 F100', { rapidRate: 5000 });
    expect(r.issues.some((i) => i.sev === 'err' && /canned cycle/.test(i.msg))).toBe(true);
  });
});

describe('time estimate with the controller\'s acceleration', () => {
  const opts = { rapidRate: 5000, accel: { x: 400, y: 400, z: 50 }, maxRate: { x: 5000, y: 5000, z: 1000 }, junctionDev: 0.01 };
  it('matches exact physics for a move that reaches full speed', () => {
    // 100 mm at 50 mm/s with 400 mm/s^2: L/v + v/a = 2.125 s
    expect(parseGcode('G21\nG90\nG1X100F3000', opts).totalTime).toBeCloseTo(2.125, 3);
  });
  it('matches exact physics for a move too short to reach full speed', () => {
    // 2 mm, never reaching 50 mm/s: 2 * sqrt(d / a) = 0.1414 s
    expect(parseGcode('G21\nG90\nG1X2F3000', opts).totalTime).toBeCloseTo(0.1414, 3);
  });
  it('only changes timing, never the moves', () => {
    const text = readFileSync(new URL('r1.gcode', dir), 'utf8');
    const a = parseGcode(text, { rapidRate: 5000 }), b = parseGcode(text, opts);
    expect(b.segs.map((s) => [s.x1, s.y1, s.z1])).toEqual(a.segs.map((s) => [s.x1, s.y1, s.z1]));
    expect(b.totalTime).toBeGreaterThan(a.totalTime);
  });
});
