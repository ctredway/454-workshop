// Opening a saved drawing: its toolpaths show in the Toolpaths panel, built, straight away (they used to
// need the panel's refresh button). Run on Design's real source files, with the CAM engine (test/harness.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const run = (code) => vm.runInContext(code, D);

// a drawing saved with a toolpath, as a .454.json holds it (toolpaths are saved as settings, without moves)
function savedDrawing() {
  run(`DOC.stock = Object.assign({}, DOC.stock, {w: 200, h: 120, t: 12, zero: 'top'});
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = [{t: 'rect', x: 20, y: 20, w: 80, h: 50, layer: 'L1'}]; DOC.toolpaths = []; 1`);
  const id = run('entId(DOC.ents[0])');
  run(`DOC.toolpaths = [{id: 'tp1', name: 'Sign outline', type: 'profile', side: 'outside', ents: ['${id}'], dia: 6.35,
    depth: 3, step: 1, feed: 800, plunge: 300, toolChosen: true, rpm: 18000, safeZ: 6, over: 0.2}]; 1`);
  const file = JSON.parse(run('docForStorage(true)'));
  run(`DOC.ents = []; DOC.toolpaths = []; renderToolpathPanel(); 1`);          // what was open before: nothing
  return file;
}

test('a drawing opened from a file shows its toolpaths in the panel, built, without pressing refresh', () => {
  const file = savedDrawing();
  assert.doesNotMatch(D.document.getElementById('tpPanel').textContent, /Sign outline/, 'not there before opening');
  D.openDrawing(run(`(${JSON.stringify(file)})`), 'sign.454.json');
  assert.match(D.document.getElementById('tpPanel').textContent, /Sign outline/, 'listed in the panel');
  const tp = run('DOC.toolpaths[0]');
  assert.ok(tp.moves && tp.moves.length > 10, 'and built: its moves are there to preview and save as G-code');
  assert.equal(D.tpStale(tp), false);
});
