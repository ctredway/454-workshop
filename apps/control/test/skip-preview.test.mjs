// Toolpaths left out on the Toolpaths tab show faint in the 3D view (job-skip.js jobSkipMark, viewer.js segColor), and
// stay faint as the preview plays (playback.js), so what will and won't be cut can be seen at a glance.
//   node --test 'apps/control/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const C = vm.createContext({ THREE: { Vector3: function () { this.x = 0; this.y = 0; this.z = 0; } } });
vm.runInContext(read('../../../packages/gcode/src/parser.cjs'), C, { filename: 'parser.cjs' });
for (const f of ['viewer.js', 'playback.js', 'job-summary.js', 'job-skip.js']) vm.runInContext(read('../src/js/' + f), C, { filename: f });

const FILE = ['G21 G90', ';Toolpath: Pocket', 'M3 S18000', 'G0 Z5', 'G0 X10 Y10', 'G1 Z-3 F300', 'G1 X40 F1200', 'G0 Z5',
  ';Toolpath: Profile', 'G0 X60 Y10', 'G1 Z-6 F300', 'G1 X90 F1000', 'G0 Z5', 'M5', 'M30'];
function load() {
  const M = C.parseGcode(FILE.join('\n'));
  C.MODEL = M;
  // as buildToolpath lays them out: cuts and rapids in their own colour lists, two points (6 numbers) a move
  let nc = 0, nr = 0;
  M.segs.forEach((s) => { if (s.rapid) { s.g = 1; s.v = nr; nr += 2; } else { s.g = 0; s.v = nc; nc += 2; } });
  C.cutColors = new Float32Array(nc * 3); C.rapidColors = new Float32Array(nr * 3);
  C.cutLine = { geometry: { attributes: { color: {} } } }; C.rapidLine = { geometry: { attributes: { color: {} } } };
  C.doneCount = 0; C.TP_SKIP = [];
  return M;
}
const colourOf = (s) => { const a = s.g === 0 ? C.cutColors : C.rapidColors, o = s.v * 3; return [a[o], a[o + 1], a[o + 2]].map((v) => +v.toFixed(3)); };
const inPocket = (M) => M.segs.filter((s) => s.line < 9), inProfile = (M) => M.segs.filter((s) => s.line >= 9);
const same = (a, b) => JSON.stringify(a) === JSON.stringify([...b].map((v) => +v.toFixed(3)));

test('unticking a toolpath shows its moves faint; ticking it again shows them as before', () => {
  const M = load();
  C.repaintToolpath();
  assert.ok(inPocket(M).every((s) => !same(colourOf(s), C.C_SKIP)));
  C.TP_SKIP = [true]; C.jobSkipMark();
  assert.ok(inPocket(M).every((s) => same(colourOf(s), C.C_SKIP)), 'the left-out Pocket: faint');
  assert.ok(inProfile(M).every((s) => !same(colourOf(s), C.C_SKIP)), 'the Profile: as it was');
  C.TP_SKIP = []; C.jobSkipMark();
  assert.ok(M.segs.every((s) => !s.skip && !same(colourOf(s), C.C_SKIP)));
});

test('playing the preview past a left-out toolpath leaves it faint (not coloured as cut)', () => {
  const M = load();
  C.TP_SKIP = [true]; C.jobSkipMark();
  C.setProgressColors(M.segs.length);                       // played to the end
  assert.ok(inPocket(M).every((s) => same(colourOf(s), C.C_SKIP)), 'still faint');
  assert.ok(inProfile(M).filter((s) => !s.rapid).every((s) => same(colourOf(s), C.C_CUT_D)), 'the Profile shows as cut');
});
