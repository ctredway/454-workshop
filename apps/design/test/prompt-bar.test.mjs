// The prompt bar under the drawing (prompt.js): put away when no tool is chosen (the Select tool, nothing being drawn,
// typed or selected), and kept above the History bar. Clint, 2026-10-26: "that same bar also needs to hide once no tool
// is selected". On Design's real sources:  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
// (the harness's draw() draws nothing: the tidy-up it starts with is called as it would be)
const tidy = 'promptTidy(); 1';
const on = () => D.run(`document.getElementById('promptBar').classList.contains('on')`);

test('a tool shows the bar; back to Select, it goes', () => {
  D.run(`setTool('line'); promptTidy(); 1`);
  assert.equal(on(), true, 'Line: shown');
  D.run(`setTool('select'); promptTidy(); 1`);
  assert.equal(on(), false, 'Select: put away');
});

test('a prompt left up while nothing is chosen is put away at the next redraw', () => {
  D.run(`setTool('select'); DRAW = null; DIMSEL = null; stagePrompt('selFirst'); promptTidy(); 1`);
  assert.equal(on(), false);
});

test('kept while something is under way: a shape being drawn, or a dimension selected', () => {
  D.run(`setTool('select'); DRAW = {stage: 'dimDrag', di: 0}; showPrompt('Dimension selected', '', false); promptTidy(); 1`);
  assert.equal(on(), true, 'during a drag');
  D.run(`DRAW = null; DIMSEL = 0; promptTidy(); 1`);
  assert.equal(on(), true, 'a dimension still selected: its prompt stays');
  D.run(`DIMSEL = null; promptTidy(); 1`);
  assert.equal(on(), false, 'clicked away: put away');
});

test('every redraw starts with the tidy-up', () => {
  const src = fs.readFileSync(new URL('../src/js/draw.js', import.meta.url), 'utf8');
  assert.match(src.slice(src.indexOf('function draw(){'), src.indexOf('function draw(){') + 400), /promptTidy\(\)/);
});
