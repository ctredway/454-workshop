// Fit (the button, Home, opening a drawing; tool-panel.js): the shapes drawn, or the material when nothing is drawn.
// Clint, 2026-10-26: "if there are no vectors drawn, it should fit the material boundaries, if there are vectors, it
// should fit the drawn vectors". On Design's real sources:  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
D.toast = () => {};
// a drawing area 1000 x 600 on screen
D.run(`Object.defineProperty(cv, 'clientWidth', {value: 1000, configurable: true}); Object.defineProperty(cv, 'clientHeight', {value: 600, configurable: true}); 1`);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + `: ${a} against ${b}`);
// the drawing's point at the middle of the drawing area, and the scale
const view = () => JSON.parse(D.run(`JSON.stringify({x: (500 - VIEW.ox) / VIEW.scale, y: (VIEW.oy - 300) / VIEW.scale, s: VIEW.scale})`));
function drawing(ents) {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 400, h: 300, origin: 'fl'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}, {id: 'L2', name: 'Hidden', visible: false, locked: false}];
    DOC.activeLayer = 'L1'; delete DOC.sheets; DOC.ents = ${JSON.stringify(ents)}; DOC.dims = []; 1`);
}

test('nothing drawn: the material', () => {
  drawing([]);
  D.run('fit(); 1');
  const v = view(); near(v.x, 200); near(v.y, 150, 'the middle of the material');
  near(v.s, Math.min(920 / 400, 520 / 300), 'all of it, with the margin');
});

test('shapes drawn: just them, as large as fits', () => {
  drawing([{t: 'rect', x: 50, y: 40, w: 100, h: 20, layer: 'L1'}, {t: 'circle', cx: 200, cy: 60, r: 10, layer: 'L1'}]);
  D.run('fit(); 1');
  const v = view(); near(v.x, 130); near(v.y, 55, 'the middle of the shapes (50 to 210 across, 40 to 70 up)');
  near(v.s, Math.min(920 / 160, 520 / 30));
});

test('a shape on a hidden layer is left out; only hidden shapes: the material', () => {
  drawing([{t: 'rect', x: 50, y: 40, w: 100, h: 20, layer: 'L1'}, {t: 'rect', x: 350, y: 250, w: 10, h: 10, layer: 'L2'}]);
  D.run('fit(); 1');
  near(view().x, 100, 'only the one that can be seen');
  drawing([{t: 'rect', x: 350, y: 250, w: 10, h: 10, layer: 'L2'}]);
  D.run('fit(); 1');
  near(view().x, 200, 'the material');
});

test('a tiny shape: no closer in than the wheel goes', () => {
  drawing([{t: 'circle', cx: 10, cy: 10, r: 0.5, layer: 'L1'}]);
  D.run('fit(); 1');
  assert.ok(view().s <= 60);
});

test('the material’s size changed: the material is fitted, even with shapes drawn', () => {
  drawing([{t: 'rect', x: 50, y: 40, w: 100, h: 20, layer: 'L1'}]);
  D.run(`document.getElementById('stkW').value = '600'; document.getElementById('stkW').dispatchEvent(new Event('change')); 1`);
  near(view().x, 300, 'the middle of the 600 wide material');
});
