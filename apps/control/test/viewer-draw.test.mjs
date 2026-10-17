// The 3D view is drawn when it changes, not 60 times a second (soak test, DEVELOPING.md): at once while it's being
// turned, panned, zoomed, resized or played; at most 10 times a second for changes on its own (a job's progress);
// once a second otherwise. A change is noticed by comparing what's drawn with what was drawn last.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const C = vm.createContext({ THREE: { Vector3: function () { this.x = 0; this.y = 0; this.z = 0; } } });
vm.runInContext(read('../src/js/viewer.js'), C, { filename: 'viewer.js' });

test('when a frame is drawn', () => {
  const due = C.viewFrameDue;
  assert.equal(due(1000, 990, true, false), true, 'turning or zooming: every frame');
  assert.equal(due(1000, 950, false, true), false, 'a job’s progress: not 50 ms after the last frame');
  assert.equal(due(1000, 900, false, true), true, '… but 100 ms after');
  assert.equal(due(1000, 500, false, false), false, 'nothing changed: not within a second');
  assert.equal(due(1000, 0, false, false), true, '… once a second, in case');
});

test('a change to anything drawn is noticed: position, visibility, colours, geometry, materials', () => {
  const obj = () => ({ id: 7, visible: true, position: { x: 1, y: 2, z: 3 }, scale: { x: 1 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
    material: { version: 0, opacity: 1, color: { hex: 0x123456, getHex() { return this.hex; } } },
    geometry: { attributes: { position: { version: 0 }, color: { version: 0 } }, drawRange: { start: 0, count: Infinity } } });
  const root = (o) => ({ traverse(f) { f(o); } });
  const sig = (o) => C.viewSig(root(o), []).join(',');
  const base = sig(obj());
  assert.equal(sig(obj()), base, 'nothing changed: the same');
  const changes = {
    'the tool moved': (o) => { o.position.x = 1.5; },
    'hidden': (o) => { o.visible = false; },
    'progress coloured (colours updated)': (o) => { o.geometry.attributes.color.version++; },
    'a new toolpath (geometry updated)': (o) => { o.geometry.attributes.position.version++; },
    'theme colour': (o) => { o.material.color.hex = 0xffffff; },
    'material updated': (o) => { o.material.version++; },
    'turned': (o) => { o.quaternion.w = 0.9; },
  };
  for (const [what, f] of Object.entries(changes)) { const o = obj(); f(o); assert.notEqual(sig(o), base, what); }
});
