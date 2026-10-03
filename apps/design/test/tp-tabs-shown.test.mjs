// A toolpath's tabs are drawn whenever the toolpath is, picked or not. (Hidden with its eye and shown again, a
// toolpath had no tabs on the drawing until it was updated: tabs were drawn only on the picked one, and the eye
// lets go of the pick. Found by Clint, testing.)
// Runs Design's real draw() against a stand-in canvas that counts the tab marks (ctx.rect).
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadDesign } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
// the real draw(), which the harness replaces with a no-op
vm.runInContext(fs.readFileSync(path.join(here, '../src/js/draw.js'), 'utf8'), D, { filename: 'draw.js' });
const realDraw = D.draw;
let rects = 0;
const pen = new Proxy({}, {
  get(t, k) {
    if (k === 'rect') return (x, y, w, h) => { if (h === 7) rects++; };   // a tab mark is 7 px tall
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createPattern' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'getLineDash') return () => [];
    return k in t ? t[k] : () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});
D.cv = { width: 0, height: 0, clientWidth: 800, clientHeight: 600 };
D.ctx = pen;
// how many tab marks the drawing shows
function tabsDrawn() { rects = 0; realDraw(); return rects; }

function job() {
  D.run(`DOC = {stock: Object.assign({}, DOC.stock, {w: 300, h: 200}), guides: [], dims: [], params: [],
    layers: [{id: 'L1', name: 'Layer 1', visible: true, locked: false}], activeLayer: 'L1',
    ents: [{t: 'rect', x: 10, y: 10, w: 50, h: 40, _id: 'e1'}],
    toolpaths: [{id: 'tp1', name: 'Profile', side: 'outside', ents: ['e1'], tabsOn: true, tabLen: 6, tabThk: 1.5,
      dia: 6.35, depth: 6, passDepth: 2, feed: 1000, plunge: 300, rpm: 18000, stepover: 0.4,
      tabPts: {e1: [[35, 10], [35, 50], [10, 30]]}, moves: [{g: 0, x: 0, y: 0}, {g: 1, x: 10, y: 10}]}]};
    CUT = null; CUTSEL = null; 1`);
}

test('a toolpath with tabs shows them, picked or not', () => {
  job();
  assert.equal(tabsDrawn(), 3, 'none picked');
  D.run(`CUTSEL = 'tp1'; 1`);
  assert.equal(tabsDrawn(), 3, 'picked');
});
test('hidden with its eye, its tabs go; shown again, they come back', () => {
  job();
  D.run(`CUTSEL = 'tp1'; 1`);                       // just made or edited: picked
  const tp = () => D.run(`DOC.toolpaths[0]`);
  D.tpShowHide(tp());
  assert.equal(tabsDrawn(), 0, 'hidden');
  D.tpShowHide(tp());
  assert.equal(tabsDrawn(), 3, 'shown again, with no update');
});
test('one toolpath picked: only its tabs are drawn, as with its path', () => {
  job();
  D.run(`DOC.toolpaths.push(Object.assign(JSON.parse(JSON.stringify(DOC.toolpaths[0])), {id: 'tp2', tabPts: {e1: [[60, 30]]}})); CUTSEL = 'tp2'; 1`);
  assert.equal(tabsDrawn(), 1);
  D.run(`CUTSEL = null; 1`);
  assert.equal(tabsDrawn(), 4, 'none picked: both');
});
test('a toolpath with no path (its shapes deleted) shows no tabs', () => {
  job();
  D.run(`DOC.toolpaths[0].moves = []; 1`);
  assert.equal(tabsDrawn(), 0, 'no path');
  job();
  D.run(`DOC.ents = []; 1`);
  assert.equal(tabsDrawn(), 0, 'its shape gone');
});
test('tabs turned off: none drawn', () => {
  job();
  D.run(`DOC.toolpaths[0].tabsOn = false; 1`);
  assert.equal(tabsDrawn(), 0);
});
