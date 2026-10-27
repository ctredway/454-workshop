// The Machine tab's Spindle and Console windows (they were sections of the tab). The console's log lives in its
// window, so the tab shows the latest message and counts errors not yet seen. Control's real page and files run
// here in a stand-in browser page.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
function control() {
  const page = read('../src/control.html').replace(/^@@include .*$/gm, '');
  const { document } = parseHTML(page);
  document.querySelectorAll('script').forEach((s) => s.remove());   // the page's own code isn't run here
  const C = vm.createContext({ document, TextEncoder });
  for (const f of ['../src/js/serial.js', '../src/js/machine-tab.js']) vm.runInContext(read(f), C, { filename: f });
  C.el = (id) => document.getElementById(id);
  return C;
}

test('the Machine tab: Set up opens the jog panel, the BitZero and the Spindle window; Console is a window', () => {
  const C = control();
  const tab = C.el('paneMachine');
  for (const id of ['jogOpen', 'bzOpen', 'spOpen', 'conOpen', 'jobRun', 'qaAdd', 'homeBtn'])
    assert.ok(tab.querySelector('#' + id), id + ' is on the Machine tab');
  for (const id of ['rpmIn', 'spinOn', 'spinOff', 'spinState'])
    assert.ok(C.el('spModal').querySelector('#' + id), id + ' is in the Spindle window');
  for (const id of ['consoleLog', 'consoleIn', 'verboseChk'])
    assert.ok(C.el('conModal').querySelector('#' + id), id + ' is in the Console window');
  assert.ok(!tab.querySelector('#consoleLog') && !tab.querySelector('#rpmIn'), 'and no longer on the tab');
  // the controls that move the machine are greyed until connected; the Console button isn't, so the log can be read
  assert.ok(C.el('mControls').contains(C.el('spOpen')));
  assert.ok(!C.el('mControls').contains(C.el('conOpen')));
  assert.ok(C.el('spBody').classList.contains('disabledArea') && C.el('consoleIn').disabled, 'not connected yet');
});

test('the Spindle window opens and closes', () => {
  const C = control();
  assert.equal(C.el('spModal').hidden, true);
  C.spOpenModal(); assert.equal(C.el('spModal').hidden, false);
  C.spCloseModal(); assert.equal(C.el('spModal').hidden, true);
});

test('errors are counted on the Console button until the window is opened; the latest message shows on the tab', () => {
  const C = control();
  const badge = C.el('conBadge'), last = C.el('conLast');
  assert.equal(badge.hidden, true);
  C.logC('tx', 'G0 X10');
  C.logC('rx', 'ok');
  assert.equal(badge.hidden, true, 'sent lines and oks are not news');
  assert.equal(last.textContent, '');
  C.logC('sys', 'connected');
  assert.equal(last.textContent, 'connected');
  C.logC('err', 'error:22 — feed rate has not yet been set');
  C.logC('err', 'ALARM:1 — hard limit');
  assert.deepEqual([badge.hidden, badge.textContent], [false, '2']);
  assert.equal(last.textContent, 'ALARM:1 — hard limit');
  assert.equal(last.className, 'err');
  C.conOpenModal();
  assert.deepEqual([C.el('conModal').hidden, badge.hidden], [false, true], 'seen');
  C.logC('err', 'error:20');
  assert.equal(badge.hidden, true, 'not counted while the window is open');
  C.conCloseModal();
  C.logC('err', 'error:2');
  assert.deepEqual([badge.hidden, badge.textContent], [false, '1'], 'counting starts again from one');
  assert.equal(C.el('consoleLog').children.length, 7, 'every line is still in the log');
});
