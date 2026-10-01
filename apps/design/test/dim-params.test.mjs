// Dimensions driven by parameters (dimension-params.js): typed as a name or arithmetic, remembered, and applied
// again when a parameter changes, on a cabinet-like layout where the dimensions depend on each other. On Design's
// real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
D.run('if (!HTMLInputElement.prototype.select) HTMLInputElement.prototype.select = function () {}; 1');   // the test page’s inputs lack it
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + `: ${a} against ${b}`);

// Two sides 700 tall, a shelf between them. Dimensions: each side's width, the shelf's thickness, the gap
// between the sides (the right side moves), and the shelf's width.
function cabinet() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 900, h: 800, t: 18, zero: 'top'});
    DOC.ents = [{t:'rect', x:0, y:0, w:18, h:700}, {t:'rect', x:600, y:0, w:18, h:700}, {t:'rect', x:18, y:300, w:582, h:18}];
    DOC.dims = []; DOC.params = [{name:'thickness', expr:'18', unit:'mm', note:''}, {name:'inner', expr:'582', unit:'mm', note:''}];
    var L = DOC.ents[0], R = DOC.ents[1], S = DOC.ents[2];
    addDim({kind:'side', a:entId(L), at:hintOf(L, {x:9, y:0})});
    addDim({kind:'side', a:entId(R), at:hintOf(R, {x:609, y:0})});
    addDim({kind:'side', a:entId(S), at:hintOf(S, {x:18, y:309})});
    addDim({kind:'pair', a:entId(R), b:entId(L), edge:false, aAt:hintOf(R, {x:600, y:500}), bAt:hintOf(L, {x:18, y:500})});
    addDim({kind:'side', a:entId(S), at:hintOf(S, {x:300, y:300})});
    UNDO.length = 0; SEL = []; 1`);
}
// type into dimension i, as at the drawing
function type(i, txt) { D.run(`DRAW = {stage:'dimValue', di:${i}}; DIMSEL = ${i}; toolCommitText(${JSON.stringify(txt)}); 1`); }
const ents = () => plain(D.run('DOC.ents'));
const dims = () => plain(D.run('DOC.dims'));
const value = (i) => D.run(`dimValue(DOC.dims[${i}])`);
const label = (i) => D.run(`dimLabel(DOC.dims[${i}])`);
function setParam(name, expr) { D.run(`paramByName(${JSON.stringify(name)}).expr = ${JSON.stringify(expr)}; paramsApplyDims().length`); }

test('type a parameter into a dimension: it’s applied, and remembered', () => {
  cabinet();
  type(0, 'thickness + 1');
  near(ents()[0].w, 19, 'the left side is 19 wide');
  assert.equal(dims()[0].expr, 'thickness + 1'); assert.equal(dims()[0].exprUnit, 'mm');
  assert.equal(label(0), '19.00 = thickness + 1');
  type(0, '18');
  assert.equal(dims()[0].expr, undefined, 'a plain number unlinks it');
  assert.equal(label(0), '18.00');
});
test('change a parameter: every dimension using it follows, including ones that depend on each other', () => {
  cabinet();
  type(0, 'thickness'); type(1, 'thickness'); type(2, 'thickness'); type(3, 'inner'); type(4, 'inner');
  setParam('thickness', '19.2');
  const [L, R, S] = ents();
  near(L.w, 19.2, 'left side'); near(R.w, 19.2, 'right side'); near(S.h, 19.2, 'shelf thickness');
  near(R.x - (L.x + L.w), 582, 'the gap between the sides holds, so the right side moved over');
  setParam('inner', '600');
  { const [L2, R2, S2] = ents(); near(R2.x - (L2.x + L2.w), 600, 'the gap between the sides'); near(S2.w, 600, 'shelf width'); }
  for (let i = 0; i < 5; i++) assert.ok(!/⚠/.test(label(i)), 'all hold: ' + label(i));
});
test('parameters using parameters, in inches', () => {
  cabinet();
  D.run(`DOC.params.push({name:'dado', expr:'thickness + 1/64', unit:'in', note:''}); 1`);
  type(2, 'dado');
  near(ents()[2].h, 18 + 25.4 / 64);
  setParam('thickness', '3/4in');
  near(ents()[2].h, 19.05 + 25.4 / 64, 'thickness in inches, plus a 64th');
});
test('the material’s thickness: change it in Settings and dimensions using material follow', () => {
  cabinet();
  type(0, 'material');
  near(ents()[0].w, 18);
  D.run(`DOC.stock.t = 12.7; paramsApplyDims(); 1`);
  near(ents()[0].w, 12.7);
});
test('something moved by hand: marked ⚠ until the parameters are applied again', () => {
  cabinet();
  type(0, 'thickness');
  D.run('DOC.ents[0].w = 25; 1');
  assert.equal(label(0), '25.00 = thickness ⚠');
  D.run('paramsApplyDims(); 1');
  assert.equal(label(0), '18.00 = thickness');
});
test('what can’t be done is said, and changes nothing', () => {
  cabinet();
  const before = ents();
  type(0, 'nope * 2');
  assert.deepEqual(ents(), before, 'an unknown name changes nothing');
  assert.equal(dims()[0].expr, undefined);
  type(0, 'thickness - 30');
  assert.deepEqual(ents(), before, 'a size under 0 changes nothing');
  // a parameter that can't be worked out later: reported, the dimension marked
  type(0, 'thickness');
  D.run(`DOC.params = []; 1`);
  const failed = plain(D.run('paramsApplyDims().map(function (f) { return f.why; })'));
  assert.match(failed[0], /no parameter called .thickness./);
  assert.match(label(0), /⚠$/);
});
test('the old ways of typing still work: fractions, units, and e for edge to edge', () => {
  cabinet();
  D.run(`DOC.stock.units = 'mm'; 1`);
  type(0, '3/4in'); near(ents()[0].w, 19.05);
  type(3, '25e'); assert.equal(dims()[3].edge, true, 'e: edge to edge'); assert.equal(dims()[3].expr, undefined);
  type(0, '12 1/2'); near(ents()[0].w, 12.5, 'twelve and a half, as on a tape');
});
test('one Undo takes back a dimension set to a parameter', () => {
  cabinet();
  type(0, 'thickness + 2');
  D.run('doUndo(); 1');
  near(ents()[0].w, 18); assert.equal(dims()[0].expr, undefined);
});
test('reopening a linked dimension shows its expression to edit', () => {
  cabinet();
  type(0, 'thickness * 2');
  D.run('editDim(0); 1');
  assert.equal(D.document.getElementById('promptIn').value, 'thickness * 2');
});
test('dimensions that undo each other are settled by going round again', () => {
  // Design's own rules avoid knocking one dimension out with another where they can (a width grows away from
  // the side a distance holds), so this makes applying the width also shift the other shape, as an awkward
  // layout might: the width, applied first, has to be applied again after it.
  cabinet();
  type(0, 'thickness'); type(3, 'inner');
  D.run(`var realApply = dimApply; dimApply = function (d, v) { var ok = realApply(d, v); if (d === DOC.dims[3] && !dimApply.once){ dimApply.once = true; DOC.ents[0].w += 3; } return ok; }; 1`);
  try {
    setParam('inner', '590');                                     // the distance moves; the width (applied before it) is knocked out
    const [L, R] = ents();
    near(L.w, 18, 'the width, applied again after the distance'); near(R.x - (L.x + L.w), 590, 'and the distance');
  } finally { D.run('dimApply = realApply; 1'); }
});
test('typed with the drawing in inches: the expression\u2019s numbers are inches', () => {
  cabinet();
  D.run(`UICFG.stockUnits = 'in'; 1`);
  try {
    type(0, 'thickness + 1');
    near(ents()[0].w, 18 + 25.4); assert.equal(dims()[0].exprUnit, 'in');
  } finally { D.run(`UICFG.stockUnits = 'mm'; 1`); }
  setParam('thickness', '20');
  near(ents()[0].w, 20 + 25.4, 'still an inch more, with the drawing back in mm');
});
