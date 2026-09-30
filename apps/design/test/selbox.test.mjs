// The Selection box: exact position, size and rotation by typing (src/js/selbox.js), on Design's real source
// files (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
function fresh(ents) {
  const D = loadDesign({ start: false });
  D.winKeys = [];                                   // the page's own key handlers, which a key in a box bubbles up to
  const add = D.addEventListener.bind(D);
  D.addEventListener = (type, f, o) => { if (type === 'keydown') D.winKeys.push(f); else add(type, f, o); };
  D.wire();
  D.run = (code) => vm.runInContext(code, D);
  D.run(`DOC.ents = ${JSON.stringify(ents)}; DOC.dims = []; SEL = ${JSON.stringify(ents.map((_, i) => i))}; setTool('select'); SEL = ${JSON.stringify(ents.map((_, i) => i))}; selBoxRefresh(); 1`);
  return D;
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} (within ${tol})`);
const box = (D) => plain(D.run('selBBox()'));
const field = (D, id) => D.document.getElementById(id);
// type into a field of the box as a person would: focus, value, Enter
function enter(D, id, value) {
  const el = field(D, id);
  el.dispatchEvent(new D.Event('focus'));
  el.value = String(value);
  key(D, el, 'Enter');
}
function key(D, el, k, o = {}) {
  const ev = new D.Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'key', { value: k }); Object.defineProperty(ev, 'ctrlKey', { value: !!o.ctrl });
  Object.defineProperty(ev, 'metaKey', { value: false }); Object.defineProperty(ev, 'shiftKey', { value: false });
  Object.defineProperty(ev, 'altKey', { value: false }); Object.defineProperty(ev, 'code', { value: '' });
  let stopped = false; const stop = ev.stopPropagation.bind(ev); ev.stopPropagation = () => { stopped = true; stop(); };
  el.dispatchEvent(ev);
  const up = { key: k, ctrlKey: !!o.ctrl, metaKey: false, shiftKey: false, altKey: false, code: '', target: el,
    defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} };
  if (!stopped) D.winKeys.forEach((f) => f(up));    // as a browser would: on up to the window, unless stopped
}
const anchor = (D, a) => D.document.querySelector(`#sbAnchor button[data-a="${a}"]`).click();

test('it shows while shapes are selected with Select, with their position and size, and hides otherwise', () => {
  const D = fresh([{t:'rect', x:10, y:20, w:40, h:30}]);
  assert.equal(field(D, 'selBox').hidden, false);
  anchor(D, 'bl');
  assert.equal(field(D, 'sbX').value, '10.00'); assert.equal(field(D, 'sbY').value, '20.00');
  assert.equal(field(D, 'sbW').value, '40.00'); assert.equal(field(D, 'sbH').value, '30.00');
  anchor(D, 'c');
  assert.equal(field(D, 'sbX').value, '30.00'); assert.equal(field(D, 'sbY').value, '35.00');
  D.run('SEL = []; selBoxRefresh(); 1');
  assert.equal(field(D, 'selBox').hidden, true);
  D.run('setTool("rect"); SEL = [0]; selBoxRefresh(); 1');
  assert.equal(field(D, 'selBox').hidden, true, 'not while drawing');
});
test('X and Y move the selection so the reference point lands there; each is one undo step', () => {
  const D = fresh([{t:'rect', x:10, y:20, w:40, h:30}, {t:'circle', cx:100, cy:50, r:10}]);
  anchor(D, 'bl');
  enter(D, 'sbX', 0); enter(D, 'sbY', '5');
  assert.deepEqual(box(D), { x0: 0, y0: 5, x1: 100, y1: 45 });
  const e = plain(D.run('DOC.ents'));
  assert.deepEqual([e[0].x, e[0].y, e[1].cx, e[1].cy], [0, 5, 90, 35], 'both moved together');
  D.run('doUndo(); SEL = [0, 1]; 1');                 // (undo clears the selection, as it always has)
  assert.deepEqual(box(D), { x0: 0, y0: 20, x1: 100, y1: 60 }, 'undo takes back the Y');
  anchor(D, 'tr');
  enter(D, 'sbX', 200); enter(D, 'sbY', 100);
  const b = box(D); near(b.x1, 200, 1e-9, 'right edge'); near(b.y1, 100, 1e-9, 'top edge');
});
test('W with the padlock closed resizes both ways about the reference point; open, just the one', () => {
  const D = fresh([{t:'rect', x:10, y:20, w:40, h:30}]);
  anchor(D, 'bl');
  assert.equal(field(D, 'sbLock').getAttribute('aria-pressed'), 'true', 'closed to begin with');
  enter(D, 'sbW', 80);
  assert.deepEqual(plain(D.run('DOC.ents[0]')), { t: 'rect', x: 10, y: 20, w: 80, h: 60 });
  field(D, 'sbLock').click();
  assert.equal(JSON.parse(D.localStorage.getItem('d454DesignUI')).selLock, false, 'remembered');
  enter(D, 'sbH', 10);
  assert.deepEqual(plain(D.run('DOC.ents[0]')), { t: 'rect', x: 10, y: 20, w: 80, h: 10 });
  anchor(D, 'c');
  enter(D, 'sbW', 40);
  assert.deepEqual(plain(D.run('DOC.ents[0]')), { t: 'rect', x: 30, y: 20, w: 40, h: 10 }, 'about the centre');
});
test('stretching a circle makes a true ellipse, and says so', () => {
  const D = fresh([{t:'circle', cx:0, cy:0, r:10}]);
  field(D, 'sbLock').click(); anchor(D, 'c');
  enter(D, 'sbW', 60);
  const e = plain(D.run('DOC.ents[0]'));
  assert.equal(e.t, 'path');
  e.pts.forEach((p) => near((p[0] / 30) ** 2 + (p[1] / 10) ** 2, 1, 1e-12, 'on the ellipse'));
  assert.ok(e.pts.every((p) => Math.abs(p[2]) > 1e-9), 'every piece a true arc, not a straight line');
  assert.match(D.run('document.body.textContent'), /Circles became ellipses/);
});
test('Rotate turns the selection about the reference point; a quarter turn leaves a rectangle a rectangle', () => {
  const D = fresh([{t:'rect', x:0, y:0, w:40, h:20}]);
  anchor(D, 'bl');
  enter(D, 'sbR', 90);
  const r = plain(D.run('DOC.ents[0]'));
  assert.equal(r.t, 'rect');
  [[r.x, -20], [r.y, 0], [r.w, 20], [r.h, 40]].forEach(([a, b], i) => near(a, b, 1e-9, 'rect ' + i));
  assert.equal(field(D, 'sbR').value, '', 'ready for the next turn');
  enter(D, 'sbR', -30);
  const p = plain(D.run('DOC.ents[0]'));
  assert.equal(p.t, 'poly');
  const bl = plain(D.run('selBBox()'));
  // the reference point (bottom left of the box before turning) was (-20, 0): the corner there turns about it
  assert.ok(p.pts.some((q) => Math.abs(q[0] + 20) < 1e-9 && Math.abs(q[1]) < 1e-9), 'the corner at the reference point stayed put');
  near(bl.y1 - bl.y0, 40 * Math.cos(Math.PI / 6) + 20 * Math.sin(Math.PI / 6), 1e-9, 'height after turning 30 degrees');
});
test('inches when the drawing is shown in inches; nonsense and zero are refused', () => {
  const D = fresh([{t:'rect', x:0, y:0, w:25.4, h:50.8}]);
  D.run(`UICFG.stockUnits = 'in'; selBoxRefresh(); 1`);
  anchor(D, 'bl');
  assert.equal(field(D, 'sbW').value, '1.000'); assert.equal(field(D, 'sbUnit').textContent, 'in');
  enter(D, 'sbX', 2);
  near(plain(D.run('DOC.ents[0]')).x, 50.8, 1e-9, '2 inches');
  const before = plain(D.run('DOC.ents[0]')), undo = D.run('UNDO.length');
  enter(D, 'sbW', 'abc'); enter(D, 'sbH', 0);
  assert.deepEqual(plain(D.run('DOC.ents[0]')), before);
  assert.equal(D.run('UNDO.length'), undo, 'no empty undo steps');
});
test('typing in the box isn\'t taken as a tool key or Delete', () => {
  const D = fresh([{t:'rect', x:0, y:0, w:10, h:10}]);
  const el = field(D, 'sbW');
  el.dispatchEvent(new D.Event('focus'));
  key(D, el, 'Delete'); key(D, el, 'r');
  assert.equal(D.run('DOC.ents.length'), 1, 'still there');
  assert.equal(D.run('TOOL'), 'select', 'still Select');
  // but Ctrl+Z still undoes the drawing from in here
  enter(D, 'sbW', 20);
  assert.equal(D.run('DOC.ents[0].w'), 20);
  key(D, el, 'z', { ctrl: true });
  assert.equal(D.run('DOC.ents[0].w'), 10, 'Ctrl+Z undid the resize');
});
