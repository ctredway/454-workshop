// Preview in wood (src/js/wood-preview.js): the cut worked out from the moves and each bit's shape, on Design's
// real source files (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} (within ${tol})`);
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
// a simulation of some moves on a 60 x 40 board, 12 thick, top at 0, on a 0.1 mm grid; h(x, y) reads a height
function sim(moves, tool, cell = 0.1) {
  const s = D.woodSim([{ moves, tool }], { x0: 0, y0: 0, x1: 60, y1: 40, top: 0, bottom: -12 }, cell);
  s.h = (x, y) => s.z[Math.floor(y / s.cell) * s.nx + Math.floor(x / s.cell)];
  return s;
}
const line = (z) => [{ g: 0, x: 10, y: 20, z: 5 }, { g: 1, z }, { g: 1, x: 40, y: 20, z }, { g: 0, z: 5 }];
// cell centres at 0.05, 0.15, ...: points on those centres read exactly

test('a flat end mill cuts a flat-bottomed slot as wide as the bit, rounded at the ends', () => {
  const s = sim(line(-2), { kind: 'flat', r: 3 });
  near(s.h(25.05, 20.05), -2, 1e-6, 'the middle');
  near(s.h(25.05, 22.95), -2, 1e-6, 'just inside the edge (2.9 from the line)');
  near(s.h(25.05, 23.15), 0, 1e-6, 'just outside it');
  near(s.h(7.15, 20.05), -2, 1e-6, 'round the start: 2.85 before it');
  near(s.h(6.85, 20.05), 0, 1e-6, '3.15 before it: untouched');
  near(s.h(7.95, 22.25), 0, 1e-6, 'the corner of the slot’s box is left: the end is round');
  near(s.deepest, -2, 1e-6, 'deepest');
});
test('a ball-nose cuts a round-bottomed groove', () => {
  const s = sim(line(-3), { kind: 'ball', r: 3 });
  near(s.h(25.05, 20.05), -3 + 3 - Math.sqrt(9 - 0.05 * 0.05), 1e-6, 'the bottom');
  near(s.h(25.05, 22.05), -3 + 3 - Math.sqrt(9 - 2.05 * 2.05), 1e-6, '2.05 across');
  near(s.h(25.05, 23.05), 0, 1e-6, 'past its radius');
});
test('a V-bit cuts a V: 90 degrees rises one for one; its tip flat is flat; it reaches only as far as its depth', () => {
  const v90 = sim(line(-2), { kind: 'v', r: 10, half: Math.PI / 4, tip: 0 });
  near(v90.h(25.05, 21.05), -2 + 1.05, 1e-6, '1.05 across: 1.05 up');
  near(v90.h(25.05, 22.15), 0, 1e-6, 'past 2 across: the top');
  const tipped = sim(line(-2), { kind: 'v', r: 10, half: Math.PI / 6, tip: 1 });
  near(tipped.h(25.05, 20.45), -2, 1e-6, 'inside the 1 mm tip: flat');
  near(tipped.h(25.05, 21.05), -2 + (1.05 - 0.5) / Math.tan(Math.PI / 6), 1e-6, '60-degree bit: steep sides');
});
test('a ramp down: each spot is cut as deep as the bit got while over it', () => {
  const s = sim([{ g: 0, x: 10, y: 20, z: 0 }, { g: 1, x: 30, y: 20, z: -4 }], { kind: 'flat', r: 3 });
  near(s.h(20.05, 20.05), -(23.05 - 10) / 20 * 4, 1e-4, 'the bit’s far edge passed over it lowest');
  near(s.h(32.95, 20.05), -4, 1e-6, 'the end, full depth (2.95 past it, inside the bit)');
});
test('rapid moves that cut wood are counted; lifting out, or dropping into wood already cut, aren’t', () => {
  assert.equal(sim(line(-2), { kind: 'flat', r: 3 }).rapidsIn, 0, 'the usual: down at feed, up at rapid');
  assert.equal(sim([{ g: 0, x: 10, y: 20, z: 5 }, { g: 0, z: -1 }, { g: 1, x: 20 }, { g: 0, z: 5 }], { kind: 'flat', r: 3 }).rapidsIn, 1, 'a rapid plunge');
  assert.equal(sim([{ g: 0, x: 10, y: 20, z: -1 }, { g: 0, x: 30 }], { kind: 'flat', r: 3 }).rapidsIn, 1, 'a rapid sideways in the wood');
  assert.equal(sim([...line(-2), { g: 0, x: 20, y: 20 }, { g: 0, z: -1.5 }, { g: 1, z: -3 }, { g: 0, z: 5 }], { kind: 'flat', r: 3 }).rapidsIn, 0,
    'a rapid down into the slot already cut, as between passes');
});
test('the picture: through-cuts show the spoilboard, the top is the lightest wood, lit evenly where flat', () => {
  const s = sim([{ g: 0, x: 10, y: 8, z: 5 }, { g: 1, z: -12.5 }, { g: 1, x: 40 }, { g: 0, z: 5 }], { kind: 'flat', r: 3 }, 0.5);   // low on the board
  const px = D.woodShade(s), at = (x, y) => { const i = Math.floor(x / s.cell), j = s.ny - 1 - Math.floor(y / s.cell), o = (j * s.nx + i) * 4; return [px[o], px[o + 1], px[o + 2]]; };
  const board = at(25.2, 8.2), top = at(55.2, 5.2), top2 = at(50.2, 35.2);
  near(at(25.2, 32.2)[0], top[0], 1, 'the same spot mirrored top to bottom is untouched wood: the picture is the right way up');
  const shade = (c) => c[0] / D.WOOD_BOARD[0];
  near(board[1] / board[0], D.WOOD_BOARD[1] / D.WOOD_BOARD[0], 0.02, 'the slot is spoilboard grey');
  assert.deepEqual(top, top2, 'flat top: the same everywhere');
  near(top[1] / top[0], D.WOOD_TOP[1] / D.WOOD_TOP[0], 0.02, 'the top is the top wood colour');
  assert.ok(shade(top) > 0, 'drawn');
});
test('a real pocket from the toolpath editor: flat floor at its depth, corners left round by the bit, nothing outside', () => {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 100, h: 80, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 40, h: 30, layer: 'L1' }]; D.DOC.toolpaths = [];
  const set = (id, v, ev) => { const el = D.document.getElementById(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'pocket', 'change'); D.CUT.toolChosen = true; set('cutDia', 6); set('cutDepth', 3); D.CUT.toolChosen = true; D.cutApply();
  const parts = D.woodParts(), box = plain(D.woodBox());
  assert.equal(parts.length, 1);
  const s = D.woodSim(parts, box, 0.1), h = (x, y) => s.z[Math.floor((y - s.y0) / s.cell) * s.nx + Math.floor((x - s.x0) / s.cell)];
  // the drawing's coordinates: the material from the stock rectangle
  for (const [x, y] of [[40, 35], [21, 35], [59, 35], [40, 21], [40, 49], [30, 25], [50, 45]]) near(h(x + 0.05, y + 0.05), -3, 1e-6, `floor at ${x},${y}`);
  near(h(20.25, 20.25), 0, 1e-6, 'the very corner: the round bit can’t reach it');
  for (const [x, y] of [[19.5, 35], [60.5, 35], [40, 19.5], [40, 50.5], [10, 10]]) near(h(x + 0.05, y + 0.05), 0, 1e-6, `outside at ${x},${y}`);
  assert.equal(s.rapidsIn, 0);
  D.woodPreviewOpen();
  assert.equal(D.document.getElementById('woodModal').hidden, false, 'the window opens');
});
test('the window says what it found: the deepest cut, and rapid moves into the material, in red', async () => {
  await new Promise((r) => setTimeout(r, 60));
  assert.match(D.document.getElementById('woodNote').textContent, /1 toolpath, cut in order\. Deepest cut 3\.00 mm/);
  assert.equal(D.document.getElementById('woodWarn').hidden, true);
  D.run('DOC.toolpaths[0].moves.splice(3, 0, {g:0, x:40, y:35, z:-1}); DOC.toolpaths[0].sig = tpSignature(DOC.toolpaths[0].ents) + tpStockSig(DOC.toolpaths[0]); 1');
  D.woodPreviewOpen();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(D.document.getElementById('woodWarn').hidden, false);
  assert.match(D.document.getElementById('woodWarn').textContent, /rapid move goes into wood/);
  D.woodPreviewClose();
  assert.equal(D.document.getElementById('woodModal').hidden, true);
  D.run('DOC.toolpaths[0].exclude = true; 1');
  assert.equal(D.woodParts().length, 0, 'an unticked toolpath isn\u2019t cut');
  D.woodPreviewOpen();
  assert.equal(D.document.getElementById('woodModal').hidden, true, 'nothing to preview: no window');
});
