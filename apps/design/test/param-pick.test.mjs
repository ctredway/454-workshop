// Parameters at the value box: a dimension on the drawing shows just its value (its parameter only while it's
// pointed at), and while a value is typed the drawing's parameters are listed under the box, narrowed to the name
// being typed, to click or Tab in. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
// the test page’s inputs have no cursor: one where it was put (select() puts it at the start, all selected), else at the end
D.run(`Object.defineProperty(HTMLInputElement.prototype, 'selectionStart', {configurable: true,
  get: function () { return this._caret === undefined ? this.value.length : this._caret; }});
HTMLInputElement.prototype.select = function () { this._caret = 0; };
HTMLInputElement.prototype.setSelectionRange = function (a) { this._caret = a; }; 1`);
const $ = (id) => D.document.getElementById(id);
// the test page has no focus: say which box has it, as clicking into it would
const focusOn = (el) => Object.defineProperty(D.document, 'activeElement', { value: el, configurable: true });

function setup() {
  D.run(`DOC.stock = Object.assign({}, DOC.stock, {w: 900, h: 800, t: 18, zero: 'top'});
    DOC.ents = [{t:'rect', x:0, y:0, w:160, h:80}];
    DOC.dims = []; DOC.params = [{name:'width', expr:'160', unit:'mm', note:''}, {name:'wall', expr:'6', unit:'mm', note:''},
                                 {name:'depth', expr:'width / 4', unit:'mm', note:''}];
    var R = DOC.ents[0];
    addDim({kind:'side', a:entId(R), at:hintOf(R, {x:80, y:0})});
    DOC.dims[0].expr = 'width'; DOC.dims[0].exprUnit = 'mm';
    UNDO.length = 0; SEL = []; 1`);
}
function openBox() { focusOn($('promptIn')); D.run('editDim(0); 1'); }
function typeIn(text) {
  const i = $('promptIn'); i.value = text; i._caret = undefined;   // typed: the cursor at the end
  i.dispatchEvent(new D.Event('input', { bubbles: true }));
}
function key(k) {
  const e = new D.Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'key', { value: k });
  $('promptIn').dispatchEvent(e);
}
const rows = () => [...$('paramPick').querySelectorAll('.pp')].map((r) => r.querySelector('b').textContent + ' ' + r.querySelector('span').textContent);
const listShown = () => !$('paramPick').hidden;

test('a dimension shows just its value on the drawing, and its parameter while pointed at', () => {
  setup();
  assert.equal(D.run('dimLabel(DOC.dims[0])'), '160.00');
  assert.equal(D.run('dimLabel(DOC.dims[0], true)'), '160.00 = width');
  // where its value was drawn (the test page doesn't draw): pointing there is pointing at it
  D.run('DOC.dims[0]._hit = {x: 200, y: 100, w: 50, h: 16}; 1');
  assert.equal(D.run('dimLabelHit(210, 104)'), 0, 'pointing at its value');
  assert.equal(D.run('dimLabelHit(240, 104)'), -1, 'beside it');
  assert.equal(D.run('UICFG.showDims = false; var h = dimLabelHit(210, 104); UICFG.showDims = true; h'), -1, 'dimensions hidden');
  assert.match(readFileSync(new URL('../src/js/draw.js', import.meta.url), 'utf8'), /dimLabel\(d, di === DIMHOVER\)/, 'the drawing shows the one pointed at in full');
});
test('typing in a dimension’s box lists the parameters, with what each comes to, and the material', () => {
  setup(); openBox();
  assert.ok(listShown(), 'shown as the box opens');
  assert.deepEqual(rows(), ['width 160.00 mm', 'wall 6.00 mm', 'depth 40.00 mm', 'material 18.00 mm (thickness)']);
  typeIn('w');
  assert.deepEqual(rows(), ['width 160.00 mm', 'wall 6.00 mm'], 'narrowed to the name being typed');
  typeIn('wid');
  assert.deepEqual(rows(), ['width 160.00 mm']);
  typeIn('width');
  assert.ok(!listShown(), 'gone once the whole name is typed');
  typeIn('18m');
  assert.ok(listShown() && rows().length === 4, 'a unit after a number isn’t a name: all of them');
  typeIn('zz');
  assert.ok(!listShown(), 'nothing starts with that');
});
test('Tab, a click, or ↓ and Enter put the name in; Enter alone still sets the value', () => {
  setup(); openBox();
  typeIn('2 * wa'); key('Tab');
  assert.equal($('promptIn').value, '2 * wall', 'Tab: the first that fits');
  typeIn('wall + w'); key('ArrowDown'); key('ArrowDown'); key('Enter');
  assert.equal($('promptIn').value, 'wall + wall', 'the second, chosen with the arrows');
  typeIn('de');
  $('paramPick').querySelector('.pp').dispatchEvent(new D.Event('mousedown', { bubbles: true, cancelable: true }));
  assert.equal($('promptIn').value, 'depth', 'clicked');
  typeIn('wall * 20'); key('Enter');
  assert.equal(D.run('DOC.ents[0].w'), 120, 'Enter with nothing chosen sets the dimension, as before');
  assert.equal(D.run('DOC.dims[0].expr'), 'wall * 20');
});
test('not shown where it can’t be used: no parameters, or the box not being typed in', () => {
  setup(); D.run('DOC.params = []; DOC.stock.t = 0; 1'); openBox();
  assert.ok(!listShown(), 'no parameters');
  setup(); focusOn(null); D.run('editDim(0); 1');
  assert.ok(!listShown(), 'the box isn’t being typed in');
  setup(); openBox(); D.run('hidePrompt(); 1');
  assert.ok(!listShown(), 'gone with the box');
});
