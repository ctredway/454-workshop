// The Rotate panel (rotate-panel.js), used as at the screen: shapes picked before or clicked while it's open, turned
// about their own centre or a point (clicked or typed), by a typed or quick angle, shown before OK; OK makes exactly
// what it showed, as one Undo and one History step whose angle can be changed afterwards.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + `: ${a} against ${b}`);
function type(id, v) { el(id).value = String(v); el(id).dispatchEvent(new D.Event('input', { bubbles: true })); }
const open = () => !el('rotPanel').hidden;
const okOn = () => !el('rotOk').disabled;
const click = (x, y) => D.run(`toolClick({x: ${x}, y: ${y}}, {x: ${x}, y: ${y}}); 1`);
const lastStep = () => plain(D.run('histLine().steps[histLine().n - 1]'));
// a line's two ends, rounded
const ends = (i) => { const e = plain(D.run(`DOC.ents[${i}]`)); return [e.x1, e.y1, e.x2, e.y2].map((v) => Math.round(v * 1e6) / 1e6); };

// a horizontal line from (10, 10) to (30, 10), and a circle; the line selected unless asked
function fresh(sel = [0], last) {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 400, h: 300, t: 18, zero: 'top', units: 'mm'}); UICFG.stockUnits = 'mm';
    DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}]; DOC.activeLayer = 'L1';
    DOC.ents = []; DOC.toolpaths = []; DOC.dims = []; DOC.guides = []; DOC.keeps = []; VIEW.scale = 4;
    UNDO = []; REDO = []; SEL = []; HIST_EDITS = []; HIST_EDITS_UNDONE = [];
    pushUndo(); DOC.ents.push({t: 'line', x1: 10, y1: 10, x2: 30, y2: 10, layer: 'L1'}, {t: 'circle', cx: 200, cy: 150, r: 5, layer: 'L1'}); persist();
    UICFG.rotLast = ${JSON.stringify(last || null)};
    setTool('select'); SEL = ${JSON.stringify(sel)}; setTool('rotate'); 1`);
}

test('the tool opens its panel with the selected shapes, a quarter turn about their centre to start with', () => {
  fresh();
  assert.ok(open());
  assert.equal(el('rotObjsVal').textContent, '1 shape');
  assert.equal(el('rotAng').value, '90');
  assert.equal(el('rotAbout').querySelector('[data-a=box]').getAttribute('aria-pressed'), 'true');
  assert.ok(el('rotPt').hidden, 'no point to pick about their centre');
  assert.equal(el('rotQuick').querySelector('[data-ang="90"]').getAttribute('aria-pressed'), 'true');
  const shown = plain(D.run('rotResults()'))[0];
  near(shown.x1, 20); near(shown.y1, 0); near(shown.x2, 20); near(shown.y2, 20);
});
test('about their centre: OK turns them as shown, as one Undo and one History step', () => {
  fresh();
  type('rotAng', 30);
  const shown = plain(D.run('rotResults()'))[0];
  el('rotOk').click();
  assert.ok(!open()); assert.equal(D.run('TOOL'), 'select');
  const e = plain(D.run('DOC.ents[0]'));
  for (const k of ['x1', 'y1', 'x2', 'y2']) near(e[k], shown[k], k);
  near(e.y2 - e.y1, 20 * Math.sin(Math.PI / 6), 'turned 30 degrees anticlockwise');
  near((e.x1 + e.x2) / 2, 20); near((e.y1 + e.y2) / 2, 10, 'about its middle');
  assert.equal(D.run('DOC.ents.length'), 2, 'nothing added');
  assert.equal(lastStep().name, 'Rotate 30°');
  D.run('doUndo(); 1');
  assert.deepEqual(ends(0), [10, 10, 30, 10]);
});
test('a quick angle: 90 clockwise', () => {
  fresh();
  el('rotQuick').querySelector('[data-ang="-90"]').click();
  assert.equal(el('rotAng').value, '-90');
  el('rotOk').click();
  assert.deepEqual(ends(0), [20, 20, 20, 0]);
});
test('about a point: the next click is the point, and a typed one works too', () => {
  fresh();
  el('rotAbout').querySelector('[data-a=pt]').click();
  assert.ok(!el('rotPt').hidden);
  assert.equal(el('rotCentre').getAttribute('aria-pressed'), 'true', 'waiting for the point');
  assert.ok(!okOn()); assert.match(el('rotHint').textContent, /Click the point/);
  click(10, 10);
  assert.equal(el('rotCx').value, '10.00'); assert.equal(el('rotCy').value, '10.00');
  type('rotCx', 0); type('rotCy', 0);
  el('rotOk').click();
  assert.deepEqual(ends(0), [-10, 10, -10, 30], 'a quarter turn about X0 Y0');
});
test('the History bar changes the angle, about their centre as they are then', () => {
  fresh();
  type('rotAng', 45); el('rotOk').click();
  assert.equal(D.run('histEdit(histLine().n - 1, {ang: 90})'), 0);
  assert.deepEqual(ends(0), [20, 0, 20, 20]);
});
test('about a point, the History bar keeps that point, even for a line with a flat box', () => {
  fresh();
  el('rotAbout').querySelector('[data-a=pt]').click();
  type('rotCx', 0); type('rotCy', 0); type('rotAng', 90);
  el('rotOk').click();
  const r = lastStep().recipe;
  assert.deepEqual(r.pt, { x: 0, y: 0 });
  const before = plain(D.run('histLine().s.map(histJoin)'));
  assert.equal(D.run('(function () { var L = histLine(); var f = histReplay(L, 0); window.__after = L.s.map(histJoin); return f; })()'), 0);
  assert.deepEqual(plain(D.run('__after')), before, 'done again, the same');
  assert.equal(D.run('histEdit(histLine().n - 1, {ang: 180})'), 0);
  assert.deepEqual(ends(0), [-10, -10, -30, -10], 'a half turn about X0 Y0');
});
test('clicking shapes adds them and takes them off; no angle is said', () => {
  fresh([]);
  assert.ok(!okOn()); assert.match(el('rotHint').textContent, /Click the shapes/);
  click(20, 10); assert.equal(el('rotObjsVal').textContent, '1 shape');
  click(205, 150); assert.equal(el('rotObjsVal').textContent, '2 shapes');
  click(205, 150); assert.equal(el('rotObjsVal').textContent, '1 shape');
  type('rotAng', 0); assert.ok(!okOn()); assert.match(el('rotHint').textContent, /angle/);
  type('rotAng', 'x'); assert.ok(!okOn());
});
test('typing with the panel open: an angle turns them', () => {
  fresh();
  D.run(`toolCommitText('-90'); 1`);
  assert.ok(!open());
  assert.deepEqual(ends(0), [20, 20, 20, 0]);
});
test('it opens as last used, and Cancel and the X change nothing', () => {
  fresh([0], { about: 'pt', ang: -45 });
  assert.equal(el('rotAng').value, '-45');
  assert.ok(!el('rotPt').hidden);
  for (const how of ['rotCancel', 'rotX']) {
    fresh();
    el(how).click();
    assert.ok(!open(), how + ' closes it');
    assert.deepEqual(ends(0), [10, 10, 30, 10], how + ' changes nothing');
  }
});
