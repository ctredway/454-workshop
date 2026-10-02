// Help in 454 Control (apps/shared/help.js, shared with 454 Design; Control's own part is src/js/help-where.js):
// where F1 opens the guides for what's on screen, and the info icons beside Control's sections, which show a short
// tip and open the guides at that section. Control's real page and files run here in a stand-in browser page.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { targets, missing } from '../../../docs-site/scripts/help-index.mjs';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
function control() {
  const page = read('../src/control.html').replace(/^@@include .*$/gm, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const { window, document } = parseHTML(page);
  const C = vm.createContext({ document, window: { addEventListener() {}, innerWidth: 1400, innerHeight: 900 },
    JOB: { active: false }, SERIAL: { connected: false }, MODEL: null });
  C.Event = window.Event;
  for (const f of ['../../shared/help.js', '../src/js/help-where.js']) vm.runInContext(read(f), C, { filename: f });
  vm.runInContext('helpWire({context: controlHelpWhere, own: /^control-/, icons: HELP_ICONS});', C);
  C.el = (id) => document.getElementById(id);
  C.send = (node, type) => node.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));
  return C;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const C = control();
const ICONS = plain(C.HELP_ICONS);
const iconAt = (sel) => { const h = C.document.querySelector(sel); return h ? [...h.children].find((c) => c.className === 'helpI') : null; };
const tipText = () => { const t = C.el('helpTip'); return !t || t.hidden ? null : C.el('helpTipText').textContent; };

test('every place marked for an icon in Control’s page has one, straight from the start', () => {
  const marked = [...C.document.querySelectorAll('.helpAt')].map((s) => s.getAttribute('data-k'));
  assert.equal(marked.length, 19);
  assert.equal(new Set(marked).size, 19, 'each marked once');
  assert.deepEqual(ICONS.map((r) => r[0]).sort(), marked.map((k) => '.helpAt[data-k="' + k + '"]').sort(), 'the list and the page agree');
  for (const [sel, where, tip] of ICONS) {
    const b = iconAt(sel);
    assert.ok(b, sel + ' has its icon');
    assert.equal(b.getAttribute('data-help-at'), where);
    assert.equal(b.getAttribute('aria-label'), tip + ' Click for the guide.');
  }
  assert.equal(C.document.querySelectorAll('.helpI').length, 19);
});
test('the old help buttons and their pop-up text are gone: the guides are the one set of words', () => {
  assert.equal(C.document.querySelectorAll('.hlp').length, 0);
  const code = fs.readdirSync(new URL('../src/js/', import.meta.url)).map((f) => read('../src/js/' + f)).join('\n');
  assert.ok(!/HELP_TEXT|showHelp|\.hlp\b/.test(code));
  assert.ok(!/class="hlp"/.test(read('../src/control.html')));
});
test('a tip is short, ends properly, and no two are the same', () => {
  const tips = ICONS.map((r) => r[2]);
  assert.equal(new Set(tips).size, tips.length);
  for (const t of tips) {
    assert.ok(t.length >= 40 && t.length <= 170, t.length + ': ' + t);
    assert.ok(t.split('. ').length <= 2, 'two sentences at most: ' + t);
    assert.match(t, /[a-z]\.$/, t);
  }
});
test('resting the pointer on an icon shows its tip; clicking opens the help at its section', () => {
  const [sel, where, tip] = ICONS.find((r) => r[0].includes('"bitzero"')), b = iconAt(sel);
  C.send(b, 'mouseenter');
  assert.equal(tipText(), tip);
  C.send(b, 'mouseleave');
  assert.equal(tipText(), null);
  C.send(b, 'focus');
  assert.equal(tipText(), tip, 'tabbing to it does the same');
  C.send(b, 'click');
  assert.equal(C.helpIsOpen(), true);
  assert.equal(C.HELP.page + '#' + C.HELP.sec, where);
  assert.equal(where, 'control-reference.html#bitzero');
  assert.equal(tipText(), null);
  C.helpClose();
});
test('every icon opens a different place, each on Control’s own pages', () => {
  const places = ICONS.map((r) => r[1]);
  assert.equal(new Set(places).size, places.length);
  assert.ok(places.every((p) => /^control-reference\.html#[a-z0-9-]+$/.test(p)));
});
test('F1 opens the guide for what Control is doing', () => {
  const where = () => C.controlHelpWhere();
  assert.equal(where(), 'control-quickstart.html#1-open-and-connect', 'not connected yet');
  C.SERIAL.connected = true;
  assert.equal(where(), 'control-quickstart.html#4-load-the-file', 'connected, nothing loaded');
  C.MODEL = { segs: [{}] };
  assert.equal(where(), 'control-quickstart.html', 'ready to go');
  C.JOB.active = true;
  assert.equal(where(), 'control-quickstart.html#5-run-it', 'a job is running');
  C.el('bzModal').hidden = false;
  assert.equal(where(), 'control-quickstart.html#3-set-your-zero', 'a window on top comes first: the BitZero');
  C.el('bzModal').hidden = true;
  C.el('setModal').hidden = false;
  assert.equal(where(), 'control-reference.html#settings');
  C.el('setModal').hidden = true;
  C.JOB.active = false; C.SERIAL.connected = false; C.MODEL = null;
  for (const [id] of plain(C.HELP_FOR_WINDOW)) assert.ok(C.el(id), id + ' is a window in Control');
  const e = { key: 'F1', target: C.document.body, preventDefault() { this.p = true; }, stopPropagation() { this.s = true; } };
  C.helpKey(e);
  assert.deepEqual([e.p, e.s, C.helpIsOpen()], [true, true, true]);
  assert.equal(C.HELP.page + '#' + C.HELP.sec, 'control-quickstart.html#1-open-and-connect');
  C.helpClose();
});
test('while help is open, a key press is kept from Control, so the jog keys can’t move the machine from behind it', () => {
  const press = (k) => { const e = { key: k, target: C.document.body, preventDefault() {}, stopPropagation() { this.s = true; } }; C.helpKey(e); return !!e.s; };
  assert.equal(press('ArrowLeft'), false, 'closed: the key goes to Control');
  C.helpOpen('control-reference.html');
  assert.equal(press('ArrowLeft'), true);
  assert.equal(press('PageDown'), true);
  C.helpClose();
  assert.equal(press('ArrowLeft'), false);
});
test('every place Control’s help opens at is in the guides (when they’re built here)', () => {
  const list = targets(read('../src/js/help-where.js'));
  assert.ok(list.length >= 19 + 6);
  const dist = new URL('../../../docs-site/dist/help-index.json', import.meta.url);
  if (!fs.existsSync(dist)) return;                        // the docs' own build checks it
  assert.deepEqual(missing(JSON.parse(fs.readFileSync(dist, 'utf8')), list), []);
});
