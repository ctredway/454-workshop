// A drawing keeps its units (DOC.stock.units; persist-units.js stockUnits), so it shows the same on every computer.
// Clint, 2026-10-26: "when I open the FilamentStand project, it is displaying the dimensions in metric. I think the
// drawing should know what units to use and Design should honor that". Settings' units are for new drawings.
// On Design's real sources:  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
D.toast = () => {};
const open = (stock) => D.openDrawing(JSON.parse(JSON.stringify({ stock, ents: [], dims: [], toolpaths: [] })), 'part.json');

test('a drawing saved in inches opens in inches on a computer set to millimetres; the computer’s setting is left alone', () => {
  D.run(`UICFG.stockUnits = 'mm'; 1`);
  open({ w: 600, h: 400, t: 18, zero: 'top', units: 'in' });
  assert.equal(D.run('stockUnits()'), 'in');
  assert.equal(D.run(`document.getElementById('stkUnits').value`), 'in', 'Job setup shows it');
  assert.equal(D.run('UICFG.stockUnits'), 'mm', 'new drawings still in mm here');
  open({ w: 600, h: 400, t: 18, zero: 'top', units: 'mm' });
  D.run(`UICFG.stockUnits = 'in'; 1`);
  assert.equal(D.run('stockUnits()'), 'mm', 'and the other way round');
});

test('saved before drawings kept their units: inches when the material is a whole number of sixteenths of an inch', () => {
  D.run(`UICFG.stockUnits = 'mm'; 1`);
  open({ w: 1219.2, h: 1219.2, t: 18, zero: 'top' });          // the filament stand: 48 x 48 in
  assert.equal(D.run('stockUnits()'), 'in');
  assert.equal(D.run('DOC.stock.units'), 'in', 'kept with it from now on');
  open({ w: 300, h: 200, t: 18, zero: 'top' });                 // whole millimetres: this computer's choice
  assert.equal(D.run('stockUnits()'), 'mm');
  D.run(`UICFG.stockUnits = 'in'; 1`);
  open({ w: 300, h: 200, t: 18, zero: 'top' });
  assert.equal(D.run('stockUnits()'), 'in');
  open({ w: 304.8, h: 609.6, t: 18, zero: 'top' });             // 12 x 24 in
  assert.equal(D.run('DOC.stock.units'), 'in');
});

test('Job setup’s units: the drawing’s, saved with it, and new drawings’ from then on', () => {
  D.run(`UICFG.stockUnits = 'mm'; 1`);
  open({ w: 300, h: 200, t: 18, zero: 'top', units: 'mm' });
  D.run(`var s = document.getElementById('stkUnits'); s.value = 'in'; s.dispatchEvent(new Event('change')); 1`);
  assert.equal(D.run('DOC.stock.units'), 'in');
  assert.equal(JSON.parse(D.run('docForStorage()')).stock.units, 'in', 'in the saved drawing');
  assert.equal(D.run('UICFG.stockUnits'), 'in', 'the next new drawing too');
  D.run(`clearDrawing(); 1`);
  assert.equal(D.run('DOC.stock.units'), 'in', 'a new drawing: in the units new drawings use');
  D.run(`UICFG.stockUnits = 'mm'; clearDrawing(); 1`);              // new drawings in mm, the one open in inches
  assert.equal(D.run('DOC.stock.units'), 'mm', 'a new drawing takes new drawings’ units, not the last drawing’s');
});
