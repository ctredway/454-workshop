// Probe… on the Jog & zero panel opens the BitZero panel with a Back to Jog button, so the jog panel needn't be
// opened again by hand. Opened any other way, there's no Back button. Control's real page and files run here in a
// stand-in browser page, with the machine replaced by stand-ins.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
function control() {
  const page = read('../src/control.html').replace(/^@@include .*$/gm, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const { document } = parseHTML(page);
  const C = vm.createContext({ document, setTimeout, log: [] });
  for (const f of ['../src/js/machine-state.js', '../src/js/jog-panel.js', '../src/js/bitzero.js'])
    vm.runInContext(read(f), C, { filename: f });
  Object.assign(C, {
    PROBE: { active: false },
    logC: (c, t) => C.log.push([c, t]),
    qaBusy: () => false,
    jogFastStop: () => {},
    maybeToolPrompt: () => C.log.push(['tool prompt']),
  });
  C.SERIAL.connected = true;
  C.el = (id) => document.getElementById(id);
  C.shown = () => ({ jog: !C.el('jogModal').hidden, bz: !C.el('bzModal').hidden, back: !C.el('bzBack').hidden });
  return C;
}

test('Probe… from the jog panel: the BitZero panel has Back to Jog, which brings the jog panel back', () => {
  const C = control();
  assert.ok(C.el('bzModal').querySelector('#bzBack'), 'the button is in the BitZero panel');
  C.jogModalOpen();
  C.bzOpenFromJog();
  assert.deepEqual({ ...C.shown() }, { jog: false, bz: true, back: true });
  C.bzBackToJog();
  assert.deepEqual({ ...C.shown() }, { jog: true, bz: false, back: true });
  assert.equal(C.BZ.fromJog, false);
});

test('opened from the Machine tab, the BitZero panel has no Back button', () => {
  const C = control();
  C.jogModalOpen(); C.bzOpenFromJog(); C.bzCloseModal();   // left over from an earlier visit
  C.bzOpenModal();
  assert.deepEqual({ ...C.shown() }, { jog: false, bz: true, back: false });
});

test('✕ still closes it all, and Back is off while the probe runs', () => {
  const C = control();
  C.jogModalOpen(); C.bzOpenFromJog();
  C.PROBE.active = true;
  C.bzUpdateCircuit();
  assert.equal(C.el('bzBack').disabled, true, 'greyed out while probing');
  C.bzBackToJog();
  assert.deepEqual({ ...C.shown() }, { jog: false, bz: true, back: true }, 'and does nothing if pressed');
  assert.match(C.el('bzStatusLine').textContent, /wait for the probe/);
  C.PROBE.active = false;
  C.bzUpdateCircuit();
  assert.equal(C.el('bzBack').disabled, false);
  C.bzCloseModal();
  assert.deepEqual({ jog: C.shown().jog, bz: C.shown().bz }, { jog: false, bz: false });
});

test('at a tool change, going to the probe and back does not bring the tool-change prompt up over them', async () => {
  const C = control();
  Object.assign(C.JOB, { active: true, toolWait: { tool: 2 }, inflight: [], parkPending: false });
  C.jogModalOpen(); C.bzOpenFromJog(); C.bzBackToJog();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(C.log.filter((l) => l[0] === 'tool prompt'), []);
  assert.equal(C.shown().jog, true);
  C.jogModalClose();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(C.log.filter((l) => l[0] === 'tool prompt').length, 1, 'closing the jog panel brings it back');
});
