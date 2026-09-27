// The job builder must produce exactly what 454 Control v0.31.2 produces, for real jobs across six
// machine setups. The fixture was recorded by running Control itself (see docs/ARCHITECTURE.md).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createJobBuilder } from '../src/build.js';
import { parseGcode } from '../../gcode/src/parse.js';

const fx = JSON.parse(readFileSync(new URL('fixtures/control-v0.31.2.json', import.meta.url), 'utf8'));
const gdir = new URL('../../gcode/test/fixtures/', import.meta.url);

function envFor(sc: any) {
  const PROFILE = JSON.parse(JSON.stringify(fx.profile)), SERIAL = JSON.parse(JSON.stringify(fx.serial));
  SERIAL.homedSeen = sc.homed; SERIAL.wco = { ...sc.wco }; SERIAL.settings = { ...fx.base.settings, ...(sc.up ? { 23: 3 } : {}) };
  SERIAL.forceOrigin = !!sc.up; SERIAL.axisSeen = sc.up ? { x: 'up', y: 'up', z: 'down' } : { x: 'down', y: 'down', z: 'down' };
  PROFILE.spindle.spinup = sc.spinup; PROFILE.run.highStart = sc.highStart; PROFILE.run.topZ = sc.topZ;
  PROFILE.run.park = { ...sc.park }; PROFILE.run.parkEnd = sc.parkEnd;
  PROFILE.run.tc = { enabled: false, preset: 'fc', x: null, y: null }; PROFILE.bitSetter = { enabled: false, x: null, y: null };
  return { PROFILE, SERIAL };
}

describe('job builder matches 454 Control, line for line', () => {
  for (const [name, sc] of Object.entries<any>(fx.scenarios)) {
    for (const file of fx.files as string[]) {
      it(`${name}: ${file}`, () => {
        const text = readFileSync(new URL(file, gdir), 'utf8');
        const { PROFILE, SERIAL } = envFor(sc);
        const MODEL = parseGcode(text, { rapidRate: 5000 });
        const b = createJobBuilder({ PROFILE, SERIAL, MODEL });
        const L = b.buildJobList(text.split(/\r\n|\r|\n/));
        const items = Array.from(L as any[]);
        const extra: Record<string, unknown> = {};
        Object.keys(L).forEach((k) => { if (isNaN(+k)) extra[k] = (L as any)[k]; });
        const want = fx.results[`${name}|${file}`];
        expect(items.length).toBe(want.items);
        expect(items.filter((it) => it.syn).map((it) => it.text)).toEqual(want.added);   // what 454 adds, readable on failure
        expect(items.slice(0, 25)).toEqual(want.head);
        expect(items.slice(-12)).toEqual(want.tail);
        expect(extra).toEqual(want.extra);
        expect(createHash('sha256').update(JSON.stringify(items)).digest('hex')).toBe(want.hash);
      });
    }
  }
});
