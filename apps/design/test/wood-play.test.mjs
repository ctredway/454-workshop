// Preview in wood, watching it cut (src/js/wood-play.js): the same simulation as the finished preview, cut a
// little at a time. However it's played, paused, dragged back or forward, playing to the end must leave exactly
// the finished preview's wood. On Design's real source files (test/harness.mjs):
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';

const plain = (v) => JSON.parse(JSON.stringify(v));
const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const $ = (id) => D.document.getElementById(id);
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const same = (a, b) => bytes(a).equals(bytes(b));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (list) => list[Math.floor(rnd() * list.length)];
const BOX = { x0: 0, y0: 0, x1: 60, y1: 40, top: 0, bottom: -12 };
// a made-up job: a few parts with different bits, moves all over (and past) the board, some rapids in the wood
function madeUp() {
  const parts = [];
  for (let p = 1 + Math.floor(rnd() * 3); p > 0; p--) {
    const kind = pick(['flat', 'ball', 'v']);
    const tool = kind === 'v' ? { kind, r: 6.35, half: Math.PI / 6, tip: pick([0, 0.5]) } : { kind, r: pick([1.5875, 3.175]) };
    const moves = [{ g: 0, z: 5 }];
    for (let i = 0, n = 6 + Math.floor(rnd() * 25); i < n; i++) {
      const m = { g: rnd() < 0.25 ? 0 : 1 };
      if (rnd() < 0.8) m.x = -5 + rnd() * 70;
      if (rnd() < 0.8) m.y = -5 + rnd() * 50;
      if (rnd() < 0.6) m.z = 3 - rnd() * 16;
      if (rnd() < 0.3) m.f = 300 + rnd() * 1500;
      moves.push(m);
    }
    parts.push({ moves, tool, feed: 900 });
  }
  return parts;
}
const cutCells = (job) => { let n = 0; for (let i = 0; i < job.z.length; i++) if (job.z[i] < job.top) n++; return n; };

test('played to the end in uneven frames, it is the finished preview’s wood exactly', () => {
  for (let t = 0; t < 25; t++) {
    const parts = madeUp(), cell = pick([0.25, 0.5]);
    const done = D.woodSim(parts, BOX, cell), job = D.woodJob(parts, BOX, cell), keeps = [];
    assert.ok(job.total > 0 && job.count > 0);
    for (let at = 0; at < job.total;) { at = Math.min(job.total, at + job.total * (0.002 + rnd() * 0.08)); D.woodSeek(job, keeps, at); }
    assert.ok(same(job.z, done.z), `job ${t}: the wood`);
    assert.equal(job.rapidsIn, done.rapidsIn, `job ${t}: rapids into wood`);
    assert.equal(job.mi, job.count, 'every move cut');
  }
});
test('dragged back and forth, then played out: still the finished wood; and a moment looks the same however it was reached', () => {
  for (let t = 0; t < 15; t++) {
    const parts = madeUp(), cell = 0.5;
    const done = D.woodSim(parts, BOX, cell), job = D.woodJob(parts, BOX, cell), keeps = [];
    const when = job.total * (0.2 + rnd() * 0.6);
    const straight = D.woodJob(parts, BOX, cell); D.woodSeek(straight, [], when);
    let wentBack = 0;
    for (let i = 0; i < 12; i++) if (D.woodSeek(job, keeps, job.total * rnd()) === 'all') wentBack++;
    assert.ok(wentBack > 0, 'it did go back');
    D.woodSeek(job, keeps, when);
    assert.ok(same(job.z, straight.z), `job ${t}: the same moment, reached by jumping about`);
    assert.equal(job.rapidsIn, straight.rapidsIn);
    D.woodSeek(job, keeps, job.total);
    assert.ok(same(job.z, done.z), `job ${t}: the end`);
    assert.equal(job.rapidsIn, done.rapidsIn);
    assert.equal(plain(job.rapidAt).length, done.rapidsIn, 'each rapid into wood is kept once, not once per visit');
  }
});
test('copies of the wood are kept on the way, for going back', () => {
  const parts = madeUp(), job = D.woodJob(parts, BOX, 0.5), keeps = [];
  D.woodSeek(job, keeps, job.total);
  assert.equal(keeps.filter(Boolean).length, D.WOOD_KEEPS);
  const mis = keeps.map((k) => k.mi);
  assert.deepEqual(mis, [1, 2, 3, 4].map((i) => Math.floor(job.count * i / 5)), 'at each fifth of the job');
  // going back to just after the second copy starts from it: nothing before it is cut again
  D.woodSeek(job, keeps, job.ends[keeps[1].mi] + 1e-9);
  assert.ok(job.mi >= keeps[1].mi);
});
test('where the cutter is: half way through a move in time is half way along it; the end is the last move’s end', () => {
  const parts = [{ tool: { kind: 'flat', r: 3 }, feed: 600, moves: [{ g: 0, x: 10, y: 20, z: 5 }, { g: 1, z: -2, f: 300 }, { g: 1, x: 40, f: 600 }, { g: 0, z: 5 }] }];
  const job = D.woodJob(parts, BOX, 0.5);
  assert.equal(job.count, 3, 'three moves with both ends known');
  // 7 mm down at 300, 30 mm along at 600, 7 mm up at the rapid rate
  const t = [7 / 300 * 60, 30 / 600 * 60, 7 / D.JS_RAPID * 60];
  assert.ok(Math.abs(job.total - (t[0] + t[1] + t[2])) < 1e-9);
  const mid = plain(D.woodAt(job, t[0] + t[1] / 2));
  assert.equal(mid.mi, 1);
  assert.ok(Math.abs(mid.x - 25) < 1e-9 && mid.y === 20 && mid.z === -2, JSON.stringify(mid));
  assert.equal(plain(D.woodAt(job, 0)).z, 5, 'the start');
  const end = plain(D.woodAt(job, job.total));
  assert.deepEqual([end.mi, end.x, end.y, end.z], [3, 40, 20, 5]);
  // the wood follows the cutter: at the middle of the slot, it's cut to about there and no further
  D.woodSeek(job, [], t[0] + t[1] / 2);
  const h = (x) => job.z[Math.floor(20.2 / 0.5) * job.nx + Math.floor(x / 0.5)];
  assert.equal(h(15.2), -2, 'behind the cutter: cut');
  assert.equal(h(35.2), 0, 'ahead of it: not yet');
});
test('back a little, within one long move: the wood goes back too', () => {
  const parts = [{ tool: { kind: 'flat', r: 1.5 }, feed: 600, moves: [{ g: 0, x: 5, y: 20, z: -2 }, { g: 1, x: 55 }] }];
  const job = D.woodJob(parts, BOX, 0.5), straight = D.woodJob(parts, BOX, 0.5);
  assert.equal(job.count, 1, 'one move');
  assert.ok(job.mv[8] > 5, 'in several steps');
  D.woodSeek(straight, [], job.total * 0.2);
  D.woodSeek(job, [], job.total * 0.8);
  const far = cutCells(job);
  assert.equal(D.woodSeek(job, [], job.total * 0.2), 'all', 'it went back');
  assert.ok(cutCells(job) < far);
  assert.ok(same(job.z, straight.z), 'as if it had only ever got that far');
});
test('a rapid into wood is counted once its move is done, however many frames the move took', () => {
  // a rapid that starts in the wood and leaves the board: only its first steps cut anything
  const parts = [{ tool: { kind: 'flat', r: 1.5 }, feed: 600, moves: [{ g: 1, x: 10, y: 20, z: -1 }, { g: 0, x: 200 }] }];
  const job = D.woodJob(parts, BOX, 0.5);
  assert.equal(D.woodSim(parts, BOX, 0.5).rapidsIn, 1);
  D.woodSeek(job, [], job.total * 0.9);
  assert.equal(job.rapidsIn, 0, 'not until the move is finished');
  D.woodSeek(job, [], job.total);
  assert.equal(job.rapidsIn, 1);
  assert.deepEqual(plain(job.rapidAt), [0], 'and which move it was');
});
test('part way through, part of the wood is cut; at the start, none', () => {
  const parts = madeUp(), done = D.woodSim(parts, BOX, 0.5), job = D.woodJob(parts, BOX, 0.5);
  D.woodSeek(job, [], 0);
  assert.equal(cutCells(job), 0);
  D.woodSeek(job, [], job.total / 2);
  const half = cutCells(job), all = cutCells({ z: done.z, top: 0 });
  assert.ok(half > 0 && half < all, `${half} of ${all}`);
});
test('the clock and the speed', () => {
  assert.equal(D.woodClock(0), '0:00');
  assert.equal(D.woodClock(65), '1:05');
  assert.equal(D.woodClock(3725), '1:02:05');
  assert.equal(D.woodSpeedFor(30), 1, 'a short job: real time');
  assert.equal(D.woodSpeedFor(400), 10, '400 s at 10x is 40 s');
  assert.equal(D.woodSpeedFor(3600), 100);
  assert.equal(D.woodSpeedFor(1e7), 1000, 'the fastest there is');
});

// ---- in the window ----
const set = (id, v, ev) => { const el = $(id); el.value = String(v); el.dispatchEvent(new D.Event(ev || 'input', { bubbles: true })); };
test('the window: opens on the finished cut, with Play, the slider at the end and the job sheet’s time', async () => {
  D.DOC.stock = Object.assign({}, D.DOC.stock, { w: 100, h: 80, t: 12, zero: 'top' });
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 20, y: 20, w: 40, h: 30, layer: 'L1' }, { t: 'rect', x: 10, y: 10, w: 70, h: 55, layer: 'L1' }]; D.DOC.toolpaths = [];
  D.SEL = [0]; D.cutOpen(null); set('cutType', 'pocket', 'change'); D.CUT.toolChosen = true; set('cutDia', 6); set('cutDepth', 3); D.CUT.toolChosen = true; D.cutApply();
  D.SEL = [1]; D.cutOpen(null); set('cutType', 'outside', 'change'); D.CUT.toolChosen = true; set('cutDia', 6); set('cutDepth', 12); D.CUT.toolChosen = true; D.cutApply();
  D.woodPreviewOpen();
  assert.equal($('woodPlayRow').hidden, true, 'not until it’s worked out');
  await wait(120);
  const total = D.run('DOC.toolpaths.reduce(function (s, tp) { return s + tpTimeSec(tp); }, 0)');
  assert.ok(total > 10, 'a real job');
  assert.ok(Math.abs(D.woodPreviewOpen.job.total - total) < 1e-6, 'the job sheet’s time');
  assert.equal($('woodPlayRow').hidden, false);
  assert.equal($('woodPlay').textContent, '▶ Play');
  assert.equal($('woodSeek').value, '1000');
  assert.equal($('woodTime').textContent, D.woodClock(total) + ' / ' + D.woodClock(total));
  assert.equal(+$('woodSpeed').value, D.woodSpeedFor(total));
  assert.equal(D.WOODPLAY, null, 'nothing is cut again until Play or the slider is used');
});
test('Play starts from uncut wood; frames move it on at the speed chosen; Pause holds it', () => {
  $('woodPlay').click();
  const P = D.WOODPLAY, total = P.job.total, speed = P.speed;
  assert.equal(P.playing, true);
  assert.equal(P.t, 0);
  assert.equal(cutCells(P.job), 0);
  assert.equal($('woodPlay').textContent, '❚❚ Pause');
  assert.equal($('woodSeek').value, '0');
  D.woodPlayTick(0.5);
  assert.ok(Math.abs(P.t - 0.5 * speed) < 1e-9, 'half a second of real time');
  assert.ok(cutCells(P.job) > 0, 'wood is coming off');
  assert.equal($('woodTime').textContent, D.woodClock(P.t) + ' / ' + D.woodClock(total));
  $('woodPlay').click();
  assert.equal(P.playing, false);
  assert.equal($('woodPlay').textContent, '▶ Play');
  const held = P.t; D.woodPlayTick(1);
  assert.equal(P.t, held, 'paused: frames do nothing');
  set('woodSpeed', 500, 'change');
  assert.equal(P.speed, 500);
  $('woodPlay').click();
  assert.equal(P.t, held, 'Play carries on from where it was');
});
test('it stops at the end, on the finished preview’s wood; Play then starts again', () => {
  const P = D.WOODPLAY;
  for (let i = 0; i < 100000 && P.playing; i++) D.woodPlayTick(0.05);
  assert.equal(P.playing, false);
  assert.equal(P.t, P.job.total);
  assert.equal($('woodSeek').value, '1000');
  assert.equal($('woodPlay').textContent, '▶ Play');
  assert.ok(same(P.job.z, D.woodPreviewOpen.last.z), 'the same wood as the finished preview');
  $('woodPlay').click();
  assert.equal(P.t, 0); assert.equal(cutCells(P.job), 0);
  $('woodPlay').click();
});
test('the slider goes to any moment, back or forward, without starting it playing', () => {
  const P = D.WOODPLAY;
  set('woodSeek', 600);
  assert.ok(Math.abs(P.t - P.job.total * 0.6) < 1e-9);
  assert.equal(P.playing, false);
  const at60 = cutCells(P.job);
  set('woodSeek', 200);
  assert.ok(cutCells(P.job) < at60, 'back: less is cut');
  set('woodSeek', 1000);
  assert.ok(same(P.job.z, D.woodPreviewOpen.last.z));
});
test('closing the window, or opening the preview again, forgets where it was', async () => {
  set('woodSeek', 300);
  D.woodPreviewClose();
  assert.equal(D.WOODPLAY, null);
  D.woodPreviewOpen();
  await wait(120);
  assert.equal(D.WOODPLAY, null);
  assert.equal($('woodSeek').value, '1000');
  D.woodPreviewClose();
});
