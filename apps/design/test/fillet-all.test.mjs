// Fillet corners: every corner of the selected shapes at once (fillet-all.js), on the real sources
// (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, (what || '') + ': ' + a + ' against ' + b);

function setup(ents) {
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = ents.map((e) => Object.assign({ layer: 'L1' }, e)); D.DOC.toolpaths = [];
  D.run('UNDO = []; REDO = []; FALL_MARKS = null; 1');
}
const plan = (objs, r, kind = 'round', which = 'all') => plain(D.filletAllPlan(objs, { r, kind, which }));
// the area inside an outline, from its drawn shape (arcs included)
const area = (e) => { const p = plain(D.tessPath(e, 0.01)); let a = 0; for (let k = 0; k < p.length; k++) { const q = p[(k + 1) % p.length]; a += p[k][0] * q[1] - q[0] * p[k][1]; } return Math.abs(a) / 2; };
const arcs = (e) => e.pts.filter((p) => Math.abs(p[2] || 0) > 1e-9).length;
// an L: 40 x 30, with a 20 x 15 notch out of its top right. Five corners point out, one (the notch's) points in.
const L = { t: 'poly', closed: true, pts: [[0, 0], [40, 0], [40, 15], [20, 15], [20, 30], [0, 30]] };

test('a rectangle: all four corners rounded, the rest of it exactly where it was', () => {
  setup([{ t: 'rect', x: 0, y: 0, w: 40, h: 20 }]);
  const p = plan([0], 3);
  assert.deepEqual([p.done, p.corners, p.missed.length, p.results.length], [4, 4, 0, 1]);
  const ne = p.results[0].ne;
  assert.equal(ne.t, 'path'); assert.equal(arcs(ne), 4);
  near(area(ne), 800 - 4 * (1 - Math.PI / 4) * 9, 0.05, 'the area less four corners of a 3 mm radius');
  const xs = plain(D.tessPath(ne, 0.01)).map((q) => q[0]), ys = plain(D.tessPath(ne, 0.01)).map((q) => q[1]);
  near(Math.min(...xs), 0, 1e-9, 'left'); near(Math.max(...xs), 40, 1e-9, 'right'); near(Math.min(...ys), 0, 1e-9, 'bottom'); near(Math.max(...ys), 20, 1e-9, 'top');
  assert.equal(D.DOC.ents[0].t, 'rect', 'the plan changes nothing by itself');
});
test('which corners: all six of an L, the five pointing out, or the one pointing in', () => {
  setup([L]);
  assert.deepEqual([plan([0], 2, 'round', 'all').done, plan([0], 2, 'round', 'out').done, plan([0], 2, 'round', 'in').done], [6, 5, 1]);
  const inner = plan([0], 2, 'round', 'in').results[0].ne;
  near(area(inner), 40 * 30 - 20 * 15 + (1 - Math.PI / 4) * 4, 0.05, 'the notch’s corner filled in by a 2 mm fillet');
  // the same whichever way round the outline was drawn
  setup([Object.assign({}, L, { pts: L.pts.slice().reverse() })]);
  assert.deepEqual([plan([0], 2, 'round', 'out').done, plan([0], 2, 'round', 'in').done], [5, 1]);
});
test('a corner the radius won’t fit is left sharp and named, the others still done', () => {
  // a 40 x 4 strip: a 3 mm fillet needs 3 mm of each edge, so the two corners on a 4 mm end can’t both have one
  setup([{ t: 'rect', x: 0, y: 0, w: 40, h: 4 }]);
  const p = plan([0], 3);
  assert.deepEqual([p.done, p.missed.length], [2, 2]);
  p.missed.forEach((m) => { assert.equal(m.why, 'fit'); assert.ok([0, 40].includes(m.x) && [0, 4].includes(m.y), JSON.stringify(m)); });
  assert.notEqual(p.missed[0].x, p.missed[1].x, 'one at each end');
  assert.equal(plan([0], 10).done, 0, 'none fits a 10 mm radius');
});
test('only the shapes chosen change, and each keeps its layer, sheet and IDs', () => {
  setup([{ t: 'rect', x: 0, y: 0, w: 40, h: 20, sheet: 'S2', _id: 'a1', vcId: 'v1', vcGroups: ['g'] }, { t: 'rect', x: 50, y: 0, w: 20, h: 20 }]);
  const p = plan([0], 3);
  assert.deepEqual(p.results.map((r) => r.i), [0]);
  const ne = p.results[0].ne;
  assert.deepEqual([ne.layer, ne.sheet, ne._id, ne.vcId, ne.vcGroups], ['L1', 'S2', 'a1', 'v1', ['g']]);
  assert.equal(ne.x, undefined, 'and no leftover rectangle sizes');
});
test('curves: corners where an arc meets a line are rounded; smooth joins and curves drawn as short pieces are not corners', () => {
  // a D: a straight back and a half circle, meeting at two sharp corners
  setup([{ t: 'path', closed: true, pts: [[0, 0, 1], [0, 20, 0]] }]);
  assert.equal(plan([0], 2).corners, 2, 'the two corners of a D');
  // a circle as 96 straight pieces (a traced or imported outline): 3.75 degrees a point, no corners
  setup([{ t: 'poly', closed: true, pts: Array.from({ length: 96 }, (_, k) => [20 * Math.cos(k / 96 * 2 * Math.PI), 20 * Math.sin(k / 96 * 2 * Math.PI)]) }]);
  const p = plan([0], 2);
  assert.deepEqual([p.corners, p.missed.length], [0, 0], 'no rings round a circle');
  // a slot: two lines and two half circles, joined smoothly
  setup([{ t: 'path', closed: true, pts: [[0, 0, 0], [30, 0, 1], [30, 10, 0], [0, 10, 1]] }]);
  assert.equal(plan([0], 2).corners, 0);
});
test('dog-bones and T-bones: corners pointing out or in, never all; one beside a curve is named', () => {
  setup([{ t: 'rect', x: 0, y: 0, w: 40, h: 20 }]);
  const out = plan([0], 3.175, 'dogbone', 'out');
  assert.deepEqual([out.done, out.missed.length], [4, 0], 'a pocket’s four corners');
  assert.equal(plan([0], 3.175, 'dogbone', 'all').done, 4, '“all” is taken as pointing out');
  assert.equal(plan([0], 3.175, 'dogbone', 'in').corners, 0, 'a rectangle has no corner pointing in');
  setup([L]);
  assert.equal(plan([0], 3.175, 'dogbone', 'all').corners, 5, 'an L’s five corners pointing out, not all six');
  assert.equal(plan([0], 3.175, 'tbone', 'in').done, 1, 'a part’s inside corner gets a T-bone');
  setup([{ t: 'path', closed: true, pts: [[0, 0, 1], [0, 20, 0]] }]);
  const d = plan([0], 2, 'dogbone', 'out');
  assert.equal(d.done, 0); assert.ok(d.missed.length > 0 && d.missed.every((m) => m.why === 'curved'), JSON.stringify(d.missed));
});
test('an open shape: rounded with all corners, left out when only some are asked for', () => {
  setup([{ t: 'poly', closed: false, pts: [[0, 0], [20, 0], [20, 20], [40, 20]] }]);
  assert.equal(plan([0], 3).done, 2, 'its two bends');
  const p = plan([0], 3, 'round', 'out');
  assert.deepEqual([p.done, p.openSkipped], [0, 1]);
});
test('the panel: open with shapes selected, OK changes them in one undo step, and corners it couldn’t do stay ringed until the next change', () => {
  setup([{ t: 'rect', x: 0, y: 0, w: 40, h: 4 }, { t: 'rect', x: 50, y: 0, w: 20, h: 20 }, { t: 'rect', x: 80, y: 0, w: 20, h: 20 }]);
  D.run("UICFG.filletType = 'round'; UICFG.filletAllWhich = 'all'; SEL = [0, 1]; setTool('filletall'); 1");
  assert.equal(D.document.getElementById('fallPanel').hidden, false);
  const r = D.document.getElementById('fallR'); r.value = '3'; r.dispatchEvent(new D.Event('input', { bubbles: true }));
  assert.match(D.document.getElementById('fallHint').textContent, /^6 corners in 2 shapes will change\. 2 corners are ringed in red and will stay sharp: the radius is too big for the edges beside them\.$/);
  assert.equal(D.document.getElementById('fallObjsVal').textContent, '2 shapes');
  D.document.getElementById('fallOk').click();
  assert.equal(D.document.getElementById('fallPanel').hidden, true);
  assert.deepEqual(plain(D.DOC.ents).map((e) => e.t), ['path', 'path', 'rect'], 'the two chosen, not the third');
  assert.equal(plain(D.run('FALL_MARKS')).length, 2, 'two rings on the drawing');
  assert.match(D.document.querySelector('.toast:last-child').textContent, /Rounded 6 corners at 3\.00 mm\. 2 corners are ringed in red: they stayed sharp\./);
  D.run('doUndo(); 1');
  assert.deepEqual(plain(D.DOC.ents).map((e) => e.t), ['rect', 'rect', 'rect'], 'one undo puts both back');
  D.run('pushUndo(); 1');
  assert.equal(D.run('FALL_MARKS'), null, 'the rings go with the next change');
});
test('the panel: clicking shapes adds and removes them; with dog-bones, All can’t be chosen; ✕ cancels', () => {
  setup([{ t: 'rect', x: 0, y: 0, w: 40, h: 20 }]);
  D.run("UICFG.filletType = 'round'; SEL = []; setTool('fillet'); 1");
  assert.equal(D.document.getElementById('filletAllBtn').hidden, false, 'the Fillet tool offers it');
  D.document.getElementById('filletAllBtn').click();
  assert.match(D.document.getElementById('fallHint').textContent, /^Click shapes on the drawing/);
  D.run('VIEW.scale = 4; 1');                           // (the test page has no size of its own)
  D.run('fallClick({x: 20, y: 0}); 1');
  assert.equal(D.document.getElementById('fallObjsVal').textContent, '1 shape');
  D.document.querySelector('#fallKind button[data-k="dogbone"]').click();
  assert.equal(D.document.querySelector('#fallWhich button[data-w="all"]').disabled, true);
  assert.equal(D.document.querySelector('#fallWhich button[data-w="out"]').getAttribute('aria-pressed'), 'true');
  assert.equal(D.run('UICFG.filletType'), 'dogbone', 'the Fillet tool’s own kind, so the two agree');
  D.run('fallClick({x: 20, y: 0}); 1');
  assert.equal(D.document.getElementById('fallObjsVal').textContent, 'none');
  D.document.getElementById('fallX').click();             // (Esc does the same: see wiring.js)
  assert.equal(D.document.getElementById('fallPanel').hidden, true);
  assert.equal(D.run('TOOL'), 'select');
  assert.equal(D.DOC.ents[0].t, 'rect');
  D.run("UICFG.filletType = 'round'; 1");
});
