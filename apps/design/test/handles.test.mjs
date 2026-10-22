// The selection's handles, as in VCarve (Clint, 2026-10-22): selecting shows scale handles straight away, and
// each click on a selected shape switches between scale and rotate handles. Design's real sources, in Node.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const C = loadDesign();
const D = { run: (js) => vm.runInContext(js, C) };
const H = () => JSON.parse(D.run('JSON.stringify({active: HANDLES.active, mode: HANDLES.mode})'));

test('selecting shows the scale handles at once; nothing selected, none', () => {
  D.run("setTool('select'); DOC.ents = [{t:'rect', x:0, y:0, w:20, h:10}, {t:'circle', cx:50, cy:5, r:5}]; SEL = []; handlesSync();");
  assert.deepEqual(H(), { active: false, mode: 'scale' });
  D.run('SEL = [0]; handlesSync();');
  assert.deepEqual(H(), { active: true, mode: 'scale' }, 'one click selects, with the handles showing');
  D.run('SEL = [0, 1]; handlesSync();');
  assert.deepEqual(H(), { active: true, mode: 'scale' }, 'a bigger selection too');
  D.run('SEL = []; handlesSync();');
  assert.equal(H().active, false);
});

test('clicking a selected shape again switches to rotate, and again back to scale', () => {
  D.run("setTool('select'); SEL = []; handlesSync(); SEL = [0]; handlesSync();");
  D.run('handlesClickAgain();'); assert.deepEqual(H(), { active: true, mode: 'rotate' });
  D.run('handlesClickAgain();'); assert.deepEqual(H(), { active: true, mode: 'scale' });
});

test('a new selection starts again with scale handles', () => {
  D.run("setTool('select'); SEL = []; handlesSync(); SEL = [0]; handlesSync(); handlesClickAgain();");
  assert.equal(H().mode, 'rotate');
  D.run('SEL = [1]; handlesSync();');
  assert.deepEqual(H(), { active: true, mode: 'scale' });
});

test('Esc puts the handles away; clicking the shape again brings back the scale handles', () => {
  D.run("setTool('select'); SEL = []; handlesSync(); SEL = [0]; handlesSync(); HANDLES.active = false;");   // what Esc does first
  D.run('handlesSync();'); assert.equal(H().active, false, 'they stay away while the selection stays the same');
  D.run('handlesClickAgain();'); assert.deepEqual(H(), { active: true, mode: 'scale' });
});

test('no handles with another tool', () => {
  D.run("setTool('line'); SEL = [1]; handlesSync();");
  assert.equal(H().active, false);
  D.run("setTool('select');");
});
