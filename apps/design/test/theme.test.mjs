// Display colours and the light theme (src/js/ui-settings.js): a colour at its default follows the theme, one
// you picked doesn't. Run on Design's real source files (test/harness.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
const run = (code) => vm.runInContext(code, D);

test('on the dark theme, the default colours are drawn as they are', () => {
  run("THEME.theme = 'dark'");
  assert.equal(D.dispCol('vec'), '#dce3ea');
  assert.equal(D.dispCol('dim'), '#8fb8d8');
});
test('on the light theme, colours still at their default are drawn dark enough to see', () => {
  run("THEME.theme = 'light'");
  for (const k of ['vec', 'tp', 'con', 'dim']) assert.equal(D.dispCol(k), run(`COL_LIGHT.${k}`), k);
  assert.equal(D.dispCol('vec'), '#27303a', 'shapes: near-black, not near-white');
});
test('a colour you picked is used on either theme', () => {
  run("UICFG.colors.vec = '#ff0000'");
  run("THEME.theme = 'light'"); assert.equal(D.dispCol('vec'), '#ff0000');
  run("THEME.theme = 'dark'"); assert.equal(D.dispCol('vec'), '#ff0000');
  run("UICFG.colors.vec = COL_DARK.vec; THEME.theme = 'dark'");
});
test('the Settings swatches show the colours as drawn, and follow a change of theme', () => {
  run("THEME.theme = 'light'; syncColorInputs()");
  assert.equal(D.document.getElementById('colVec').value, '#27303a');
  run("applyTheme({theme:'dark', accent:'gold'})");
  assert.equal(D.document.getElementById('colVec').value, '#dce3ea');
});
