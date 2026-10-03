// The left panel folds away to its Tools and Layers tabs, for more drawing room, as the Toolpaths panel folds to a
// strip on the right. « folds it, » or either tab opens it, and it stays as it was left. (Asked for by Clint.)
// On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadDesign } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const D = loadDesign();
const $ = (id) => D.document.getElementById(id);
const panel = () => $('toolPanel');
const folded = () => panel().classList.contains('folded');
const saved = () => JSON.parse(D.localStorage.getItem('d454DesignUI'));

test('open to start with, with « at the bottom of the tabs', () => {
  assert.equal(folded(), false);
  const b = $('sideFold');
  assert.ok(b, 'the fold button');
  assert.equal(b.textContent, '«');
  assert.equal(b.getAttribute('aria-expanded'), 'true');
  assert.equal(b.parentElement.className, 'sideTabs', 'in the strip of tabs, so it stays when folded');
});
test('« folds it away and » opens it again, remembered', () => {
  $('sideFold').click();
  assert.equal(folded(), true);
  assert.equal($('sideFold').textContent, '»');
  assert.equal($('sideFold').getAttribute('aria-expanded'), 'false');
  assert.equal(saved().sidePanel, false);
  $('sideFold').click();
  assert.equal(folded(), false);
  assert.equal(saved().sidePanel, true);
});
test('a tab clicked while folded opens it, on that tab', () => {
  $('sideFold').click();
  $('sideTabLayers').click();
  assert.equal(folded(), false);
  assert.equal($('paneLayers').hidden, false);
  assert.equal($('paneTools').hidden, true);
  $('sideTabTools').click();
});
test('still folded after the panel is rebuilt (groups moved)', () => {
  $('sideFold').click();
  D.buildToolPanel(); D.wirePanel();
  assert.equal(folded(), true);
  assert.equal($('sideFold').textContent, '»');
  $('sideFold').click();
  assert.equal(folded(), false);
});
test('folded, and the tab, are remembered between visits', () => {
  const E = loadDesign({ start: false });
  E.localStorage.setItem('d454DesignUI', JSON.stringify({ sidePanel: false, sideTab: 'layers' }));
  E.wire();
  const p = E.document.getElementById('toolPanel');
  assert.equal(p.classList.contains('folded'), true);
  assert.equal(E.document.getElementById('sideTabLayers').getAttribute('aria-selected'), 'true');
});
test('folded, the panel hides everything but the tabs', () => {
  const css = fs.readFileSync(path.join(here, '../src/styles/design.css'), 'utf8');
  assert.match(css, /#toolPanel\.folded \.sidePane\{display:none\}/);
});
