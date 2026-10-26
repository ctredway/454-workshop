// The tool panels open as they were last used, after Design is closed and opened again: their settings are saved with
// the rest (uiCfgSave), and read back on starting (uiCfgLoad, which takes only the settings it names).
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

test('Offset, Array, Rotate and Copy remember their last settings from one visit to the next', () => {
  const D = loadDesign({ start: false });
  const run = (code) => vm.runInContext(code, D);
  D.localStorage.setItem('d454DesignUI', JSON.stringify({
    lastOffset: 6.35,
    arrLast: { kind: 'circ', n: 4, dx: 20, dy: 0, nc: 8, full: true, step: 45 },
    rotLast: { about: 'pt', ang: -30 },
    cpyLast: { dx: 0, dy: 32, n: 5 },
  }));
  D.wire();
  assert.equal(run('UICFG.lastOffset'), 6.35);
  assert.deepEqual(JSON.parse(run('JSON.stringify([UICFG.arrLast, UICFG.rotLast, UICFG.cpyLast])')),
    [{ kind: 'circ', n: 4, dx: 20, dy: 0, nc: 8, full: true, step: 45 }, { about: 'pt', ang: -30 }, { dx: 0, dy: 32, n: 5 }]);
  run(`DOC.ents = [{t: 'rect', x: 0, y: 0, w: 10, h: 10}]; SEL = [0]; setTool('copy'); 1`);
  assert.equal(D.document.getElementById('cpyN').value, '5', 'the Copy panel opens with them');
});
test('settings that aren’t right are left out, and the panels open as at first', () => {
  const D = loadDesign({ start: false });
  const run = (code) => vm.runInContext(code, D);
  D.localStorage.setItem('d454DesignUI', JSON.stringify({ lastOffset: -2, arrLast: 'x', rotLast: null }));
  D.wire();
  assert.equal(run('UICFG.lastOffset'), undefined);
  assert.equal(run('UICFG.arrLast'), undefined);
  assert.equal(run('UICFG.rotLast'), undefined);
});
