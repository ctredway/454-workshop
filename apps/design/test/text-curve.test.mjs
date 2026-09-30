// Text along a curve (src/js/text-curve.js), with a real font (Roboto, as the desktop app ships it), on Design's
// real source files (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { loadDesign } from './harness.mjs';

const require = createRequire(import.meta.url);
const opentype = require('../../desktop/node_modules/opentype.js');
const roboto = fs.readFileSync(new URL('../../desktop/node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff', import.meta.url));
const plain = (v) => JSON.parse(JSON.stringify(v));
function fresh(ents, cam = false) {
  const D = loadDesign({ start: false, cam });
  D.wire();
  D.run = (code) => vm.runInContext(code, D);
  D.FONTS.roboto.font = opentype.parse(roboto.buffer.slice(roboto.byteOffset, roboto.byteOffset + roboto.byteLength));
  D.run(`DOC.ents = ${JSON.stringify(ents)}; DOC.dims = []; SEL = []; 1`);
  return D;
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} (within ${tol})`);
const text = (str, extra = {}) => Object.assign({ t: 'text', str, font: 'roboto', h: 10, align: 'left', x: 0, y: -50, rot: 0 }, extra);
// each letter's outline (the text's shapes in world coordinates), and their centres
const outlines = (D, i = 0) => plain(D.run(`textWorld(DOC.ents[${i}])`));
function centre(ct) { let x = 0, y = 0; ct.forEach((p) => { x += p[0]; y += p[1]; }); return [x / ct.length, y / ct.length]; }
// the letters, in reading order: each glyph's outlines grouped (for these tests' letters, one outline each)
const fit = (D) => D.run('textOnCurveClick()');

test('on a circle: the letters stand on the top, outside it, reading left to right, centred on the top', () => {
  const D = fresh([text('HIHIH'), { t: 'circle', cx: 0, cy: 0, r: 40 }]);
  D.run('SEL = [0, 1]; 1');
  assert.equal(fit(D), true);
  const cs = outlines(D).map(centre);
  assert.equal(cs.length, 5, 'five letters, one outline each');
  cs.forEach((c) => {
    const r = Math.hypot(c[0], c[1]);
    near(r, 45, 0.6, 'each letter’s middle half a letter outside the circle');   // cap height 10: middle at 5
    assert.ok(c[1] > 0, 'on the top half');
  });
  for (let i = 1; i < cs.length; i++) assert.ok(cs[i][0] > cs[i - 1][0], 'left to right');
  near(cs[2][0], 0, 0.3, 'the middle letter at the top');
  assert.equal(plain(D.run('SEL')).length, 1, 'the text is selected; the circle is still there');
  assert.equal(D.run('DOC.ents.length'), 2);
});
test('each letter turns with the curve: an I on a circle points away from the centre', () => {
  const D = fresh([text('I'.repeat(20)), { t: 'circle', cx: 0, cy: 0, r: 30 }]);   // round a good part of the circle
  D.run('SEL = [0, 1]; 1'); fit(D);
  outlines(D).forEach((ct) => {
    // an I is a tall bar: its long axis is the direction from its bottom to its top
    const c = centre(ct);
    let far = ct[0], d = 0;
    ct.forEach((p) => { const dd = Math.hypot(p[0] - c[0], p[1] - c[1]); if (dd > d) { d = dd; far = p; } });
    const ax = [far[0] - c[0], far[1] - c[1]], rad = [c[0], c[1]];
    const cos = Math.abs(ax[0] * rad[0] + ax[1] * rad[1]) / Math.hypot(...ax) / Math.hypot(...rad);
    assert.ok(cos > 0.9, 'the bar lines up with the radius: ' + cos);
  });
  const cs = outlines(D).map(centre);
  assert.ok(Math.min(...cs.map((c) => c[1])) < 15, 'the letters reach well down the sides, where turning matters');
});
test('Reverse puts it along the bottom, still reading left to right, letters inside', () => {
  const D = fresh([text('HIHIH'), { t: 'circle', cx: 0, cy: 0, r: 40 }]);
  D.run('SEL = [0, 1]; 1'); fit(D);
  D.run('DOC.ents[0].crev = true; 1');
  const cs = outlines(D).map(centre);
  cs.forEach((c) => { near(Math.hypot(c[0], c[1]), 35, 0.6, 'inside the circle'); assert.ok(c[1] < 0, 'along the bottom'); });
  for (let i = 1; i < cs.length; i++) assert.ok(cs[i][0] > cs[i - 1][0], 'still left to right');
});
test('Under it: the letters hang from the curve; the gap moves them off it', () => {
  const D = fresh([text('HHH'), { t: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }]);
  D.run('SEL = [0, 1]; 1'); fit(D);
  let ys = outlines(D).flat().map((p) => p[1]);
  near(Math.min(...ys), 0, 1e-6, 'standing on the line'); near(Math.max(...ys), 10, 1e-6, 'capital height 10');
  D.run(`DOC.ents[0].cside = 'below'; 1`);
  ys = outlines(D).flat().map((p) => p[1]);
  near(Math.max(...ys), 0, 1e-6, 'tops on the line'); near(Math.min(...ys), -10, 1e-6, 'hanging below it');
  D.run(`DOC.ents[0].cgap = 2; 1`);
  ys = outlines(D).flat().map((p) => p[1]);
  near(Math.max(...ys), -2, 1e-6, 'with a 2 mm gap');
});
test('along a line drawn right to left, it still reads left to right; start, centre and end', () => {
  const D = fresh([text('HHH'), { t: 'line', x1: 100, y1: 0, x2: 0, y2: 0 }]);
  D.run('SEL = [0, 1]; 1'); fit(D);
  const xs = () => outlines(D).flat().map((p) => p[0]);
  const w = Math.max(...xs()) - Math.min(...xs());
  near((Math.max(...xs()) + Math.min(...xs())) / 2, 50, 0.5, 'centred');
  for (const [pos, want] of [['start', 0], ['end', 100]]) {
    D.run(`DOC.ents[0].cpos = '${pos}'; 1`);
    near(pos === 'start' ? Math.min(...xs()) : Math.max(...xs()), want, 1.5, pos);   // (letters' side bearings)
  }
  assert.ok(w > 15 && w < 30, 'three letters wide: ' + w);
  const cs = outlines(D).map(centre);
  for (let i = 1; i < cs.length; i++) assert.ok(cs[i][0] > cs[i - 1][0], 'left to right');
});
test('moving, scaling and turning the text carries the curve with it; undo and Straighten', () => {
  const D = fresh([text('HHH'), { t: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }]);
  D.run('SEL = [0, 1]; 1'); fit(D);
  const before = outlines(D).flat();
  D.run('moveEntity(DOC.ents[0], 10, 20); 1');
  outlines(D).flat().forEach((p, i) => { near(p[0], before[i][0] + 10, 1e-9, 'moved x'); near(p[1], before[i][1] + 20, 1e-9, 'moved y'); });
  D.run(`DOC.ents[0].cpos = 'start'; 1`);
  const x0 = Math.min(...outlines(D).flat().map((p) => p[0]));
  near(x0, 10, 1.5, 'starting at the (moved) line’s start, x 10');
  D.run('scaleEnt(DOC.ents[0], 0, 0, 2, 2); 1');
  near(Math.min(...outlines(D).flat().map((p) => p[0])), 20, 3, 'scaled twice about 0,0: the curve starts at x 20 now');
  const ys = outlines(D).flat().map((p) => p[1]);
  near(Math.max(...ys) - Math.min(...ys), 20, 1e-6, 'twice the height');
  near(Math.min(...ys), 40, 1e-6, 'still standing on the (moved, scaled) line at y 40');
  D.run('rotateEnt(DOC.ents[0], 0, 0, Math.PI / 2); 1');
  const xs = outlines(D).flat().map((p) => p[0]);
  near(Math.max(...xs), -40, 1e-6, 'turned a quarter: the line is now at x -40, letters on its left');
  D.run('doUndo(); 1');
  assert.ok(!('curve' in plain(D.run('DOC.ents[0]'))), 'undo takes it off the curve');
  D.run('SEL = [0, 1]; 1'); fit(D);
  D.run('textStraighten(DOC.ents[0]); 1');
  const e = plain(D.run('DOC.ents[0]'));
  assert.ok(!('curve' in e) && !('cpos' in e), 'straightened');
});
test('it says when the text is longer than the curve; it needs one text and one curve', () => {
  const D = fresh([text('HHHHHHHHHH'), { t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'line', x1: 0, y1: 10, x2: 20, y2: 10 }]);
  D.run('SEL = [0]; 1');
  assert.equal(fit(D), false, 'just the text');
  D.run('SEL = [0, 1, 2]; 1');
  assert.equal(fit(D), false, 'two curves');
  D.run('SEL = [0, 1]; 1');
  assert.equal(fit(D), true);
  outlines(D);
  assert.equal(D.run('textCurveTooLong(DOC.ents[0])'), true);
  D.run('DOC.ents[0].h = 1; 1'); outlines(D);
  assert.equal(D.run('textCurveTooLong(DOC.ents[0])'), false, 'smaller letters fit on the same curve');
  const xs = outlines(D).flat().map((p) => p[0]);
  near((Math.max(...xs) + Math.min(...xs)) / 2, 10, 0.2, 'changing the letter height leaves the curve where it was: still centred on it');
});
test('the text on a curve saves, reloads and cuts as the same shapes', () => {
  const D = fresh([text('OHIO'), { t: 'arc', cx: 0, cy: 0, r: 50, a0: 0.3, a1: Math.PI - 0.3, ccw: true }], true);
  D.run('SEL = [0, 1]; 1'); fit(D);
  const before = outlines(D);
  const saved = D.run('JSON.stringify(DOC.ents[0])');
  D.run(`DOC.ents[0] = JSON.parse(${JSON.stringify(saved)}); 1`);
  assert.deepEqual(outlines(D), before, 'the same letters after a save and reload');
  const cut = plain(D.run(`tpOutlinesById([entId(DOC.ents[0])]).length`));
  assert.equal(cut, before.length, 'a toolpath sees every outline, holes included (O has two)');
});
