// The parts bin's shapes (parts-bin/geometry.js), checked against Clint's design in SolidCraft: the volumes and
// sizes SolidCraft measured on 2026-10-17, from its exact geometry. Ours are made of flat facets, so they come out a
// hair smaller; with fine facets, within 0.05%.  node --test 'apps/gadgets/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { DEFAULTS, derived, problems, frame, insert } from '../parts-bin/geometry.js';

const M = await Module();
M.setup();
const fine = { seg: 48, filletSteps: 24 };
const near = (got, want, what, rel = 5e-4) => assert.ok(Math.abs(got - want) <= Math.abs(want) * rel, `${what}: ${got} (SolidCraft ${want})`);
const box = (s) => { const b = s.boundingBox(); return [...b.min, ...b.max].map((v) => Math.round(v * 1000) / 1000); };
const P = (o) => Object.assign({}, DEFAULTS, o);

test('the standard Insert (1 slot, 1.3 mm corners), as SolidCraft measured it', () => {
  const s = insert(M, P({}), 1, fine);
  assert.equal(s.status(), 'NoError');
  assert.deepEqual(box(s), [-14.925, -9.8, 0, 14.925, 9.8, 4.8]);
  near(s.volume(), 1119.2235014101586, 'volume');
  near(s.surfaceArea(), 1882.9029603722474, 'surface area', 2e-3);
});
test('a 2-slot Insert for a 100 mm, 3-slot, 12 mm Frame, with the corners as they were then (1.5 mm)', () => {
  // SolidCraft measured it before its outside corners were made concentric with the Frame's (CornerR - Clear)
  const s = insert(M, P({ TrayL: 100, TrayH: 12, Units: 3 }), 2, Object.assign({ outerR: 1.5 }, fine));
  assert.equal(s.status(), 'NoError');
  assert.deepEqual(box(s), [-31.8, -9.8, 0, 31.8, 9.8, 10.8]);
  near(s.volume(), 3374.9884391404407, 'volume');
});
test('the Frame, 100 mm, 3 slots, 12 mm, with the notches as they were then (centred on the wall top)', () => {
  const p = P({ TrayL: 100, TrayH: 12, Units: 3, NotchDepth: 4.5 });
  const s = frame(M, p, fine);
  assert.equal(s.status(), 'NoError');
  assert.deepEqual(box(s), [-50, -12, 0, 50, 12, 13]);
  near(s.volume(), 7762.354643090478, 'volume');
  near(s.surfaceArea(), 10181.016429049343, 'surface area', 2e-3);
});

// ---- how the parts go together: every insert drops in, and Frames stack and interlock ----
const overlap = (a, b) => a.intersect(b).volume();
test('inserts filling every slot sit inside the Frame, clear of it and of each other, at both heights', () => {
  for (const TrayH of [6, 12]) {
    const p = P({ TrayH }), d = derived(p), f = frame(M, p);
    // 1 + 2 + 1 slots: each insert in the middle of its slots, on the Frame's floor
    let at = -d.PocketL / 2;
    const placed = [1, 2, 1].map((u) => { const s = insert(M, p, u).translate([at + u * d.Pitch / 2, 0, p.Floor]); at += u * d.Pitch; return s; });
    for (const s of placed) assert.ok(overlap(f, s) < 1e-6, `TrayH ${TrayH}: an insert hits the Frame (${overlap(f, s)} mm³)`);
    assert.ok(overlap(placed[0], placed[1]) < 1e-6 && overlap(placed[1], placed[2]) < 1e-6, 'inserts hit each other');
    // flush with the top of the walls, under the rim
    for (const s of placed) assert.equal(Math.round(s.boundingBox().max[2] * 1000) / 1000, TrayH);
    // and a hair too big would hit it: the clearance is what lets it in
    const tight = insert(M, P({ TrayH, Clear: -0.05 }), 1).translate([-d.PocketL / 2 + d.Pitch / 2, 0, p.Floor]);
    assert.ok(overlap(f, tight) > 0.1, 'a 0.05 mm oversize insert fits too: the check isn’t checking');
  }
});
test('a Frame stacked on another sits on its walls inside the rim, and the rim stops it sliding', () => {
  for (const TrayH of [6, 12]) {
    const p = P({ TrayH }), lower = frame(M, p), upper = frame(M, p).translate([0, 0, TrayH]);
    assert.ok(overlap(lower, upper) < 1e-6, `TrayH ${TrayH}: stacked Frames collide (${overlap(lower, upper)} mm³)`);
    assert.ok(overlap(lower, frame(M, p).translate([0, 0, TrayH - 0.1])) > 0.1, 'it would sink lower: it isn’t resting on the walls');
    for (const [dx, dy] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]])
      assert.ok(overlap(lower, frame(M, p).translate([dx, dy, TrayH])) > 0.1, `it slides ${dx || dy} mm without hitting the rim`);
  }
});
test('settings that can’t make a sound part are named, in words', () => {
  assert.deepEqual(problems(P({})), []);
  assert.deepEqual(problems(P({ TrayH: 12 })), []);
  assert.match(problems(P({ Units: 0 })).join(' '), /at least 1 slot/);
  assert.match(problems(P({ Units: 30 })).join(' '), /slots are too short/);
  assert.deepEqual(problems(P({ Units: 12, notches: false })), [], '12 slots of 10 mm still hold a small insert');
  assert.match(problems(P({ TrayW: 6 })).join(' '), /too narrow/);
  assert.match(problems(P({ Clear: 2 })).join(' '), /clearance can’t be more than the corner radius/);
  assert.match(problems(P({ NotchDepth: 9 })).join(' '), /notches don’t fit/);
  assert.deepEqual(problems(P({ NotchDepth: 9, notches: false })), [], 'no notches: their size doesn’t matter');
});
