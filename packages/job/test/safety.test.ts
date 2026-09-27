// Whole real jobs, built by the job builder and streamed with character counting into the simulated
// GRBL controller, then checked against the rules 454 promises. These were checked by hand before;
// now they run on every change.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createJobBuilder } from '../src/build.js';
import { parseGcode } from '../../gcode/src/parse.js';
import { GrblSim, Streamer } from '../../grbl/src/index.js';

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

/** Run a job list through the simulator the way Control streams it; tool changes pause the stream. */
function runJob(items: any[], sc: any) {
  const settings = { ...fx.base.settings, ...(sc.up ? { 23: 3 } : {}), ...(sc.homed ? {} : { 20: 0 }) };
  const home = sc.up ? { x: 1, y: 1, z: -1 } : { x: -1, y: -1, z: -1 };
  const sim = new GrblSim({ settings, start: home, home });
  if (sc.homed) { sim.write('$H\n'); sim.step(5); } else { sim.write('$X\n'); }
  sim.wco = { ...sc.wco };                                  // the job's zero, as set before the run
  if (!sc.homed) sim.mpos = { x: sc.wco.x, y: sc.wco.y, z: sc.wco.z + 20 };   // somewhere sensible above the work
  sim.out.length = 0;
  const toolChanges: { t: number; spindleOn: boolean; mz: number }[] = [];
  let seen = 0, chunk: string[] = [];
  const flush = () => {
    const st = new Streamer(chunk, (d) => sim.write(d)); chunk = [];
    for (let k = 0; k < 5e6 && !(st.done && sim.state === 'Idle'); k++) {
      st.fill(); sim.step(0.05);
      while (seen < sim.out.length) st.onLine(sim.out[seen++]);
    }
    return st;
  };
  const errs: string[] = [];
  for (const it of items) {
    if (it.m6) { errs.push(...flush().errors.map((e) => `${e.reply} on ${e.line}`)); toolChanges.push({ t: sim.t, spindleOn: sim.spindle.on, mz: sim.mpos.z }); continue; }
    chunk.push(it.text);
  }
  errs.push(...flush().errors.map((e) => `${e.reply} on ${e.line}`));
  return { sim, toolChanges, errs };
}

const lastEvents = new Map<string, any>();
describe('real jobs through the simulated controller keep 454\'s promises', () => {
  for (const [name, sc] of Object.entries<any>(fx.scenarios)) {
    for (const file of fx.files as string[]) {
      it(`${name}: ${file}`, () => {
        const text = readFileSync(new URL(file, gdir), 'utf8');
        const { PROFILE, SERIAL } = envFor(sc);
        const MODEL = parseGcode(text, { rapidRate: 5000 });
        const builder: any = createJobBuilder({ PROFILE, SERIAL, MODEL });
        const L: any = builder.buildJobList(text.split(/\r\n|\r|\n/));
        const travel = -builder.travelZ();                  // 454's traverse height, as a machine Z
        const items = Array.from(L as any[]);
        const { sim, toolChanges, errs } = runJob(items, sc);
        const ev = sim.timeline;
        const work = (e: any, p: any) => sim.toWork(p, e.wco, e.tlo);

        // 1. no errors, no overfilled receive buffer
        expect(errs).toEqual([]);
        expect(sim.errors).toEqual([]);

        // 2. every cut below Z0 happens with the spindle running and up to speed
        let spinOnAt = -Infinity, wasOn = false; const cutsTooSoon: string[] = [], cutsSpindleOff: string[] = [];
        for (const e of ev) {
          if (e.kind === 'spindle'){ if (e.spindleOn && !wasOn) spinOnAt = e.t; wasOn = e.spindleOn; continue; }
          if (e.kind !== 'move' || e.rapid) continue;
          const zEnd = work(e, e.to).z, zStart = work(e, e.from).z;
          if (Math.min(zEnd, zStart) >= -0.001) continue;
          if (!e.spindleOn) cutsSpindleOff.push(`${e.line} at ${e.t.toFixed(1)}s`);
          else if (sc.spinup > 0 && e.t < spinOnAt + sc.spinup - 1e-6) cutsTooSoon.push(`${e.line} ${(e.t - spinOnAt).toFixed(2)}s after M3`);
        }
        expect(cutsSpindleOff).toEqual([]);
        expect(cutsTooSoon).toEqual([]);

        // 3. the spindle never stops while the tool is in the material
        const stopsInMaterial = ev.filter((e) => e.kind === 'spindle' && !e.spindleOn && work(e, e.from).z < -0.001).map((e) => `${e.line} at work Z ${work(e, e.from).z.toFixed(3)}`);
        expect(stopsInMaterial).toEqual([]);

        // 4. tool changes: spindle off, Z at the top (when homed)
        for (const tc of toolChanges) {
          expect(tc.spindleOn).toBe(false);
          if (sc.homed) expect(tc.mz).toBeGreaterThanOrEqual(-sc.topZ - 0.01);
        }

        // 5. moves 454 adds never go into the material, and its lifts end at a safe height: at least 454's
        //    traverse height when homed (from the very top a "lift" may drop slightly to it, since 454's top
        //    sits below the switch), or higher than they started when not homed
        const added = new Set(items.filter((it) => it.syn && it.text).map((it) => it.text.toUpperCase()));
        const bad: string[] = [];
        for (const e of ev) {
          if (e.kind !== 'move' || !added.has(e.line)) continue;
          if (work(e, e.to).z < -0.001) bad.push(`${e.line} ends in the material (work Z ${work(e, e.to).z.toFixed(3)})`);
          if (/^G53 G0 Z/.test(e.line) && e.to.z < Math.min(travel, -sc.topZ) - 0.001) bad.push(`${e.line} ends below the traverse height`);
          if (/^G91 G0 Z/.test(e.line) && !(e.to.z > e.from.z)) bad.push(`${e.line} didn't go up`);
        }
        expect(bad).toEqual([]);

        // 6. the ending: spindle off; parked (homed) or lifted (not homed)
        expect(sim.spindle.on).toBe(false);
        const extra = L as any;
        if (sc.homed && sc.parkEnd && extra.parked) {
          expect(sim.mpos.x).toBeCloseTo(extra.parked.x, 3); expect(sim.mpos.y).toBeCloseTo(extra.parked.y, 3);
          expect(sim.mpos.z).toBeCloseTo(-sc.topZ, 3);
        } else if (sc.homed) {
          expect(sim.mpos.z).toBeCloseTo(-sc.topZ, 3);
        } else {
          const lastCut = [...ev].reverse().find((e) => e.kind === 'move' && !e.rapid)!;
          expect(sim.toWork(sim.mpos).z).toBeGreaterThan(work(lastCut, lastCut.to).z);
        }
        lastEvents.set(`${name}|${file}`, { cuts: ev.filter((e) => e.kind === 'move' && !e.rapid).length, secs: sim.t, toolChanges: toolChanges.length });
      }, 120000);
    }
  }
});
