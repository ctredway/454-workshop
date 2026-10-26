// Messages (messages.js): dismissed with their X, they're gone from the recent messages (the lightbulb's list) too;
// one that fades by itself stays there to look back at. Clint, 2026-10-26: "if the X is clicked on a notification that
// notification needs to be cleared from the list". On Design's real sources:  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
D.run = (code) => vm.runInContext(code, D);
const titles = () => JSON.parse(D.run('JSON.stringify(MSG_LOG.map(function (m) { return m.title; }))'));

test('the X takes a message off the list; the others stay', () => {
  D.run(`MSG_LOG.length = 0; document.getElementById('toastWrap').innerHTML = '';
    toast('info', 'First'); toast('warn', 'Second'); toast('ok', 'Third'); 1`);
  assert.deepEqual(titles(), ['Third', 'Second', 'First']);
  D.run(`Array.prototype.filter.call(document.querySelectorAll('#toastWrap .toast'), function (t) { return t.querySelector('b').textContent === 'Second'; })[0].querySelector('.tx').click(); 1`);
  assert.deepEqual(titles(), ['Third', 'First'], 'Second is gone from the list');
  assert.equal(D.run(`document.getElementById('msgCount').textContent`), '2', 'and the count says so');
  assert.equal(D.run(`document.querySelectorAll('#toastWrap .toast').length`), 2, 'and from the screen');
});

test('the same words twice: only the one dismissed goes', () => {
  D.run(`MSG_LOG.length = 0; document.getElementById('toastWrap').innerHTML = ''; toast('info', 'Same'); toast('info', 'Same'); 1`);
  D.run(`document.querySelectorAll('#toastWrap .toast')[0].querySelector('.tx').click(); 1`);
  assert.deepEqual(titles(), ['Same']);
});

test('all dismissed: the lightbulb goes', () => {
  D.run(`MSG_LOG.length = 0; document.getElementById('toastWrap').innerHTML = ''; toast('info', 'Only'); refreshMsgBulb(); 1`);
  assert.equal(D.run(`document.getElementById('msgBulb').hidden`), false);
  D.run(`document.querySelector('#toastWrap .toast .tx').click(); 1`);
  assert.equal(D.run(`document.getElementById('msgBulb').hidden`), true);
});
