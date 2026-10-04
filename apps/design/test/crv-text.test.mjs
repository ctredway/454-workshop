// VCarve text and material (src/js/crv-text.js, crv-import.js). VCarve keeps text as text: each letter's outline
// centred on zero, and numbers beside it that say where it goes. Read as plain outlines, every letter of every
// block lands on one spot. (Found by Clint, opening a tutorial project: twelve blocks of text in one pile, and a
// 12 x 9 job read as 6 x 4.5.)
// The rule here was checked against the DXF VCarve exports from that project: 1,002 letter outlines of straight
// text exactly, 8 on a curve to 0.003 in. That project isn't ours to keep in the repository, so these tests use
// its numbers, and text data built here the way VCarve writes it.
// A second project, made by Clint for this, is kept with the DXF VCarve exports from it (test/fixtures/
// vcarve-text.crv and .dxf): the last test opens it and holds every shape to that DXF.
// On Design's real source files (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} (within ${tol})`);
const apply = (T, x, y) => [T[0] * x + T[2] * y + T[4], T[1] * x + T[3] * y + T[5]];
const ID = [1, 0, 0, 0, 1, 0];                                      // a block that isn't scaled or moved

// ---- the material ----
function material(x0, y0, z0, x1, y1, z1) {
  const b = new Uint8Array(434), dv = new DataView(b.buffer);
  b[0] = 8; b[5] = 1;
  [x0, y0, z0, x1, y1, z1].forEach((v, k) => dv.setFloat64(6 + 8 * k, v, true));
  return D.crvMaterial(b);
}
test('the material is the space between its two corners, not its high corner', () => {
  // as in five of Clint's projects
  assert.deepEqual(plain(material(0, 0, -0.5, 20, 20, 0)), { w: 20, h: 20, t: 0.5, zero: 'top', x0: 0, y0: 0 });
  assert.deepEqual(plain(material(0, 0, -12.25, 762, 762, 0)), { w: 762, h: 762, t: 12.25, zero: 'top', x0: 0, y0: 0 });
  assert.deepEqual(plain(material(0, 0, -0.5, 24, 48, 0)), { w: 24, h: 48, t: 0.5, zero: 'top', x0: 0, y0: 0 });
  // zeroed at its centre: 12 x 9 x 1.25, which used to be read as 6 x 4.5 with no thickness
  assert.deepEqual(plain(material(-6, -4.5, -1.25, 6, 4.5, 0)), { w: 12, h: 9, t: 1.25, zero: 'top', x0: -6, y0: -4.5 });
  assert.equal(material(0, 0, 0, 10, 10, 18).zero, 'bottom', 'its bottom at zero');
  assert.deepEqual(plain(D.crvMaterial(null)), { w: 0, h: 0, t: 0, zero: 'top', x0: 0, y0: 0 }, 'no material in the file');
});
test('where XY zero is: a corner or the centre of the material, or nowhere Design has a name for', () => {
  assert.equal(D.crvZeroAt(12, 9, 0, 0), 'corner');
  assert.equal(D.crvZeroAt(12, 9, -6, -4.5), 'center');
  assert.equal(D.crvZeroAt(12, 9, -12, 0), 'fr');
  assert.equal(D.crvZeroAt(12, 9, 0, -9), 'bl');
  assert.equal(D.crvZeroAt(12, 9, -12, -9), 'br');
  assert.equal(D.crvZeroAt(12, 9, -3, -4.5), null);
});
test('a project zeroed at its centre opens with its zero there; one zeroed somewhere odd has its shapes moved to the corner', () => {
  const sq = [[[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]]];
  const mid = plain(D.crvToDoc({ stockW: 12, stockH: 9, stockT: 1.25, stockZero: 'top', stockAt: [-6, -4.5], contours: sq }, 25.4));
  assert.equal(mid.stock.origin, 'center');
  near(mid.stock.w, 304.8, 1e-9, 'width'); near(mid.stock.h, 228.6, 1e-9, 'height'); near(mid.stock.t, 31.75, 1e-9, 'thickness');
  assert.deepEqual(mid.ents[0].pts[0], [-25.4, -25.4], 'the shapes stay where they are');
  assert.equal(mid.moved, null);
  const odd = plain(D.crvToDoc({ stockW: 12, stockH: 9, stockAt: [-3, -4], contours: sq }, 1));
  assert.equal(odd.stock.origin, 'corner');
  assert.deepEqual(odd.moved, [3, 4]);
  assert.deepEqual(odd.ents[0].pts[0], [2, 3], 'moved with the material');
  assert.equal(plain(D.crvToDoc({ stockW: 12, stockH: 9, contours: sq }, 1)).stock.origin, 'corner', 'a project read before: as before');
});

// ---- where letters go ----
const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
test('straight text: the pen moves on by each letter’s advance and kerning; the outline sits at the pen plus its centre', () => {
  // three letters 2 wide, centred on their own zero; advance 3; the first kerned 0.5 closer to the second
  const blk = { set: { text_justify: 0 }, m: ID, box: [10, 0, 18.5, 4], lines: [{ drop: 0, chars: [
    { adv: 3, c: 1, kern: -0.5, outs: [100] }, { adv: 3, c: 1, kern: 0, outs: [200] }, { adv: 2, c: 0, kern: 0, outs: [] }, { adv: 3, c: 1.5, kern: 0, outs: [300] }] }] };
  const boxes = { 100: box(-1, 0, 1, 4), 200: box(-1, 0, 1, 4), 300: box(-1, 0, 1, 4) };
  const T = Object.fromEntries(plain(D.crvTextPlace(blk, boxes)).map((p) => [p.at, p.T]));
  // in a row: centres at 1, 3.5, 9 (pen 0, 2.5, then a space to 7.5); the row spans 0 to 10; its left edge goes to the box's, 10
  assert.deepEqual(apply(T[100], 0, 0), [11, 0]);
  assert.deepEqual(apply(T[200], 0, 0), [13.5, 0]);
  assert.deepEqual(apply(T[300], 0, 0), [19, 0]);
  assert.deepEqual(apply(T[100], -1, 4), [10, 4], 'top left of the first letter: the box’s top left');
});
test('lines: each sits its own distance below the last; centred text is centred by the letters, not the pen', () => {
  const blk = { set: { text_justify: 2 }, m: ID, box: [-5, -10, 5, 0], lines: [
    { drop: 0, chars: [{ adv: 11, c: 5, kern: 0, outs: [1] }] },                       // 10 wide
    { drop: 3, chars: [{ adv: 9, c: 2, kern: 0, outs: [2] }] }] };                     // 4 wide, with a lot of advance after it
  const boxes = { 1: box(-5, 0, 5, 2), 2: box(-2, -0.5, 2, 2) };
  const T = Object.fromEntries(plain(D.crvTextPlace(blk, boxes)).map((p) => [p.at, p.T]));
  assert.deepEqual(apply(T[1], 0, 0), [0, -2], 'the first line: its top at the box’s top');
  assert.deepEqual(apply(T[2], 0, 0), [0, -5], 'the second: 3 below, and centred under the first whatever its advance');
});
test('the recorded box can be out of date (VCarve’s own was, twice): centred text still lands by its centre', () => {
  const chars = [{ adv: 11, c: 5, kern: 0, outs: [1] }], boxes = { 1: box(-5, 0, 5, 2) };
  const exact = plain(D.crvTextPlace({ set: { text_justify: 2 }, m: ID, box: [20, 0, 30, 2], lines: [{ drop: 0, chars }] }, boxes));
  const stale = plain(D.crvTextPlace({ set: { text_justify: 2 }, m: ID, box: [20.1, 0, 29.9, 2], lines: [{ drop: 0, chars }] }, boxes));
  assert.deepEqual(stale, exact);
});
test('the block’s matrix puts it on the page: its size, a mirror, its place', () => {
  const blk = { set: { text_justify: 0 }, m: [-0.5, 0, 17, 0, 2, -23], box: [0, 0, 2, 4], lines: [{ drop: 0, chars: [{ adv: 3, c: 1, kern: 0, outs: [1] }] }] };
  const T = plain(D.crvTextPlace(blk, { 1: box(-1, 0, 1, 4) }))[0].T;
  assert.deepEqual(apply(T, -1, 0), [17, -23], 'its left edge, at the block’s zero');
  assert.deepEqual(apply(T, 1, 4), [16, -15], 'mirrored across, half as wide, twice as tall');
});
test('text on a curve: USA on its arc, as VCarve’s own DXF has it', () => {
  // the numbers of the project's "USA": three letters, 6.45 tall, on one arc
  const blk = { set: { IsOnCurve: true, text_justify: 2, Justification: 2 }, m: ID, box: [-10.47, -5.2666, 9.40085, 2.51004],
    curve: [{ t: 1, x0: -12.41719, y0: -6.30478, x1: 12.28441, y1: -6.30478, b: -0.18712 }],
    lines: [{ drop: 0, chars: [{ adv: 6.5573, c: 3.0868, kern: 0, outs: [1] }, { adv: 5.8704, c: 2.6475, kern: 0, outs: [2] }, { adv: 6.5216, c: 3.1404, kern: 0, outs: [3] }] }] };
  const boxes = { 1: box(-3.0868, -0.0446, 3.0868, 6.4592), 2: box(-2.653, -0.0446, 2.6519, 6.5038), 3: box(-3.1404, -0.0089, 3.1404, 6.4413) };
  const T = Object.fromEntries(plain(D.crvTextPlace(blk, boxes)).map((p) => [p.at, p.T]));
  // from the DXF: where each letter's own origin sits in the block, and how far it's turned
  const truth = { 1: [-6.299, -4.567, 10.51], 2: [-0.2213, -3.9938, 0.11], 3: [6.1132, -4.5573, -10.34] };
  for (const at of [1, 2, 3]) {
    const [x, y] = apply(T[at], 0, 0), deg = Math.atan2(T[at][1], T[at][0]) * 180 / Math.PI;
    near(x, truth[at][0], 0.006, 'letter ' + at + ' across'); near(y, truth[at][1], 0.002, 'letter ' + at + ' up');
    near(deg, truth[at][2], 0.2, 'letter ' + at + ' turned');
    near(Math.hypot(T[at][0], T[at][1]), 1, 1e-12, 'turned, not stretched');
  }
});
test('text set left on a curve: its letters start where the curve starts', () => {
  // a half circle of radius 20 over the top, and two letters 4 wide with the pen moving on 5: A is 0..4, B 5..9
  const blk = { set: { IsOnCurve: true, Justification: 0 }, m: ID, box: [0, 0, 1, 1], curve: [{ t: 1, x0: -20, y0: 0, x1: 20, y1: 0, b: -1 }],
    lines: [{ drop: 0, chars: [{ adv: 5, c: 2.5, kern: 0, outs: [1] }, { adv: 5, c: 2, kern: 0, outs: [2] }] }] };
  const T = Object.fromEntries(plain(D.crvTextPlace(blk, { 1: box(-2, 0, 2, 4), 2: box(-2, 0, 2, 4) })).map((p) => [p.at, p.T]));
  // A's outline is centred 2.5 past the pen, so it reaches 0.5 to 4.5; the letters start at the curve's start, so A's centre is 2 along it, and B's (pen 5, centre 7) is 6.5 along
  for (const [at, dist] of [[1, 2], [2, 6.5]]) {
    const a = Math.PI - dist / 20, [x, y] = apply(T[at], 0, 0);
    near(x, 20 * Math.cos(a), 1e-9, 'letter ' + at + ' across'); near(y, 20 * Math.sin(a), 1e-9, 'letter ' + at + ' up');
    near(Math.atan2(T[at][1], T[at][0]), a - Math.PI / 2, 1e-9, 'turned to the curve');
  }
});
test('what hasn’t been checked against VCarve isn’t placed: it says why', () => {
  const ok = { IsOnCurve: true, KeepSize: true, ReverseCurve: false, CurveAlign: 0, FillPercent: 100, Justification: 2, Orientation: 1, OffsetDistance: 0, SpacingValue: 1 };
  const curve = [{ t: 1, x0: 0, y0: 0, x1: 10, y1: 0, b: 0.2 }], one = [{ chars: [] }];
  assert.equal(D.crvTextCant({ set: { text_justify: 0 }, lines: one }), '');
  assert.equal(D.crvTextCant({ set: { text_justify: 2 }, lines: [{}, {}] }), '');
  assert.equal(D.crvTextCant({ set: ok, curve, lines: one }), '');
  assert.match(D.crvTextCant({ set: { text_justify: 1 }, lines: one }), /set to the right/);
  assert.equal(D.crvTextCant({ set: { text_justify: 2, auto_layout: true }, lines: one }), '', 'fitted to a box: the letters are kept at the size they’re drawn');
  assert.equal(D.crvTextCant({ set: { ...ok, Justification: 0, KeepSize: false, ReverseCurve: true }, curve, lines: one }), '', 'set left, turned round and sized to its curve');
  assert.match(D.crvTextCant({ set: { ...ok, Justification: 1 }, curve, lines: one }), /set to the right on its curve/);
  assert.match(D.crvTextCant({ set: ok, curve: null, lines: one }), /curve couldn’t be read/);
  assert.match(D.crvTextCant({ set: ok, curve, lines: [{}, {}] }), /more than one line/);
  for (const [k, v] of [['CurveAlign', 1], ['FillPercent', 80], ['Justification', 3], ['Orientation', 0], ['OffsetDistance', 0.25], ['SpacingValue', 1.2]])
    assert.match(D.crvTextCant({ set: { ...ok, [k]: v }, curve, lines: one }), /settings 454 hasn’t seen/, k);
});
test('a curve to walk along: a line and an arc, by distance, with the direction there; past an end it carries straight on', () => {
  const line = D.crvCurvePath([{ t: 0, x0: 0, y0: 0, x1: 3, y1: 4 }]);
  near(line.len, 5, 1e-12, 'its length');
  const half = plain(line.at(2.5));
  near(half.x, 1.5, 1e-12, 'half way along'); near(half.y, 2, 1e-12, 'half way along'); near(half.ang, Math.atan2(4, 3), 1e-12, 'its direction');
  near(line.at(7).x, 4.2, 1e-12, 'past its end');
  // a half circle of radius 1 from (-1, 0) over the top to (1, 0): clockwise, so its bulge is -1
  const arc = D.crvCurvePath([{ t: 1, x0: -1, y0: 0, x1: 1, y1: 0, b: -1 }]);
  near(arc.len, Math.PI, 1e-12, 'half way round');
  const top = plain(arc.at(Math.PI / 2));
  near(top.x, 0, 1e-12, 'the top'); near(top.y, 1, 1e-12, 'the top'); near(Math.cos(top.ang), 1, 1e-12, 'heading right there');
  const before = plain(arc.at(-2));
  near(before.x, -1, 1e-12, 'before its start: straight down from it'); near(before.y, -2, 1e-12, 'by that far');
});
test('moving an outline: an arc stays an arc when turned or scaled evenly, flips when mirrored, and becomes short lines when stretched', () => {
  const half = [[-1, 0, -1], [1, 0, 0]];                                        // the half circle over the top, closed along the bottom
  assert.deepEqual(plain(D.crvSpansMove(half, [2, 0, 0, 2, 10, 5])), [[8, 5, -1], [12, 5, 0]], 'twice the size, moved');
  assert.deepEqual(plain(D.crvSpansMove(half, [-1, 0, 0, 1, 0, 0])), [[1, 0, 1], [-1, 0, 0]], 'mirrored: the arc turns the other way');
  const tall = plain(D.crvSpansMove(half, [1, 0, 0, 3, 0, 0]));
  assert.ok(tall.length > 20 && tall.every((s) => s[2] === 0), 'stretched: no arcs left');
  near(Math.max(...tall.map((s) => s[1])), 3, 0.01, 'three times as tall');
  const b = plain(D.crvSpansBox(half));
  near(b.y1, 1, 0.01, 'an outline’s box reaches to the top of its arc'); assert.equal(b.x0, -1); assert.equal(b.y0, 0);
});

// ---- reading it from the file: text data written here the way VCarve writes it ----
function writer() {
  const bytes = [], w = {
    pos: () => bytes.length,
    raw: (list) => { for (const b of list) bytes.push(b & 255); return w; },
    zeros: (n) => w.raw(new Array(n).fill(0)),
    i32: (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); return w.raw(b); },
    f64: (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return w.raw(b); },
    str: (s) => { w.raw([0xFF, 0xFE, 0xFF, s.length]); for (const c of s) w.raw([c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8]); return w; },
    ascii: (s) => w.raw([...s].map((c) => c.charCodeAt(0))),
    // a class: by name the first time, by number after
    seen: {},
    cls: (name) => { if (w.seen[name]) return w.raw([w.seen[name] & 255, w.seen[name] >> 8]); w.seen[name] = 0x8000 + 7 * (Object.keys(w.seen).length + 3); return w.raw([0xFF, 0xFF, 1, 0, name.length, 0]).ascii(name); },
    bytes: () => new Uint8Array(bytes),
  };
  return w;
}
const FONT = '3,0Century,,1.0000,0.000676,1.365112,0.298851,1479.000000,1.0000,0,400,0,1,-2048,0,0,0,400,0,0,0,1,0,0,4,0';
// write one block of text; returns the outlines it wrote ({at, end, spans}), in order
function writeBlock(w, { settings, box, m, lines, curve }) {
  const outs = [];
  for (const [name, kind, value] of settings) {
    w.cls('setting').i32(2).str(name).i32(kind);
    if (kind === 0) w.f64(value); else if (kind === 1) w.i32(value); else if (kind === 2) w.raw([value ? 1 : 0]); else w.str(value);
  }
  w.i32(1).f64(0).f64(0);                                            // a whole number, the centre on the page
  w.i32(16).ascii('Vectric__Version').i32(1).i32(36).ascii('bdd2023d-b088-41f7-ba82-d11ddca65239').i32(1);
  for (const v of box) w.f64(v);
  for (const v of [m[0], m[1], m[2], m[3], m[4], m[5], 0, 0, 1]) w.f64(v);
  w.i32(16).ascii('Vectric__Version').i32(1).i32(36).ascii('a851d33a-17d2-44b1-a3a9-4377e5068c3f');
  w.i32(6).i32(lines.length);
  const outline = (pts) => {
    w.cls('outline').i32(7).i32(-1).f64(0.001).zeros(10);
    const at = w.pos();
    w.i32(pts.length);
    pts.forEach((p, k) => { const n = pts[(k + 1) % pts.length]; w.raw([p[2] ? 1 : 0, 2, 0, 0, 0]).zeros(4).f64(p[0]).f64(p[1]).zeros(8).f64(n[0]).f64(n[1]).zeros(12); if (p[2]) w.f64(p[2]); });
    outs.push({ at, end: w.pos(), spans: pts.map((p) => [p[0], p[1], p[2] || 0]) });
  };
  for (const line of lines) {
    w.cls('txtLine').i32(2).i32(line.words.length);
    for (const word of line.words) {
      w.cls('txtWord').i32(1).i32(word.length);
      for (const ch of word) {
        w.cls('txtChar').i32(4).i32(ch.ch.charCodeAt(0)).str(FONT).f64(ch.adv);
        w.cls('outlines').i32(3).i32(ch.outlines.length);
        ch.outlines.forEach(outline);
        w.zeros(ch.outlines.length ? 39 : 17);
        for (const v of [ch.c, ch.kern || 0, 1, 1, 1, 2, 1, 0]) w.f64(v);
      }
    }
    w.f64(line.drop || 0).str(FONT).f64(1).f64(1).f64(1).f64(1).f64(1);
  }
  if (curve) {
    w.zeros(20).cls('curveHolder').i32(1).cls('outline').i32(7).i32(-1).f64(0.00001).zeros(10).i32(curve.length);
    for (const s of curve) { w.raw([s.b ? 1 : 0, 2, 0, 0, 0]).zeros(4).f64(s.x0).f64(s.y0).zeros(8).f64(s.x1).f64(s.y1).zeros(12); if (s.b) w.f64(s.b); }
  }
  w.zeros(64);
  return outs;
}
const sq = (hw, h) => [[-hw, 0], [hw, 0], [hw, h], [-hw, h]];                    // a letter: a box centred on zero, on the baseline
const letter = (ch, hw, adv, kern) => ({ ch, adv, c: hw, kern: kern || 0, outlines: [sq(hw, 4)] });
const space = { ch: ' ', adv: 1.5, c: 0, outlines: [] };
const STRAIGHT = (justify, text) => [['_txtAL_Version', 1, 1], ['_txtAL_text_justify', 1, justify], ['_txtAL_auto_layout', 2, false], ['_txtAL_height', 0, 4], ['_txtAL_Text', 3, text],
  ['_txtblkIsOnCurve', 2, false], ['_txtblkKeepSize', 2, true], ['_txtblkSpacingValue', 0, 1]];
// read text written by writeBlock, as crvExtract does: the outlines it found, then the text
function readBack(blocks, extra = []) {
  const w = writer(), all = [];
  w.zeros(40);
  for (const o of extra) { const at = w.pos(); w.i32(o.length); o.forEach((p, k) => { const n = o[(k + 1) % o.length]; w.raw([0, 2, 0, 0, 0]).zeros(4).f64(p[0]).f64(p[1]).zeros(8).f64(n[0]).f64(n[1]).zeros(12); }); all.push({ at, end: w.pos(), spans: o.map((p) => [p[0], p[1], 0]) }); w.zeros(30); }
  for (const b of blocks) all.push(...writeBlock(w, b));
  const vd = w.bytes(), contours = all.map((o) => o.spans.map((s) => s.slice()));
  const res = D.crvTextApply(vd, new DataView(vd.buffer), contours, all.map((o) => o.at), all.map((o) => o.end));
  return { res: plain(res), contours: plain(contours), vd };
}
const TWO_LINES = { settings: STRAIGHT(2, 'To be\r\nor'), box: [-6, -9, 6, 4], m: [1, 0, 100, 0, 1, 50],
  lines: [{ words: [[letter('T', 2, 4.5, -0.5), letter('o', 1.5, 3.5)], [space], [letter('b', 1.5, 3.5), letter('e', 1.5, 3.5)]] },
          { drop: 6, words: [[letter('o', 1.5, 3.5), letter('r', 1, 2.5)]] }] };
test('read from the file: lines, words and letters, each class by name the first time and by number after', () => {
  const vd = (() => { const w = writer(); w.zeros(40); const outs = writeBlock(w, TWO_LINES); return { vd: w.bytes(), outs }; })();
  const outs = Object.fromEntries(vd.outs.map((o) => [o.at, { end: o.end }]));
  const blk = plain(D.crvTextRead(vd.vd, new DataView(vd.vd.buffer), 40, vd.vd.length, outs));
  assert.equal(blk.said, 'To be or');
  assert.deepEqual(blk.box, [-6, -9, 6, 4]); assert.deepEqual(blk.m, [1, 0, 100, 0, 1, 50]);
  assert.equal(blk.sheet, 'a851d33a-17d2-44b1-a3a9-4377e5068c3f');
  assert.equal(blk.set.text_justify, 2); assert.equal(blk.set.IsOnCurve, false); assert.equal(blk.set.height, 4);
  assert.deepEqual(blk.lines.map((l) => l.chars.map((c) => String.fromCharCode(c.code)).join('')), ['To be', 'or']);
  assert.deepEqual(blk.lines.map((l) => l.drop), [0, 6]);
  const T = blk.lines[0].chars[0];
  assert.deepEqual([T.adv, T.c, T.kern, T.outs.length], [4.5, 2, -0.5, 1]);
  assert.deepEqual(blk.lines[0].chars[2], { code: 32, adv: 1.5, outs: [], c: 0, kern: 0 }, 'a space: no outlines');
  assert.deepEqual(blk.lines[0].chars.flatMap((c) => c.outs), vd.outs.slice(0, 4).map((o) => o.at), 'each letter’s outline, where it is in the file');
});
test('read and placed: letters go where the numbers say, and a shape that isn’t text is left alone', () => {
  const frame = [[0, 0], [300, 0], [300, 200], [0, 200]];
  const { res, contours } = readBack([TWO_LINES], [frame]);
  assert.equal(res.placed, 1); assert.deepEqual(res.left, []); assert.deepEqual(res.drop, {});
  assert.deepEqual(contours[0], frame.map((p) => [p[0], p[1], 0]), 'the frame');
  // line 1 in a row: T 0..4, o 4..7 (kerned), a space, b 9..12, e 12.5..15.5: 15.5 wide, centred on the box's middle (0), its top at the box's top (4);
  // then the block's matrix moves it by 100, 50
  const left = (i) => contours[i][0][0], base = (i) => contours[i][0][1];
  assert.deepEqual([1, 2, 3, 4].map(left), [-7.75, -3.75, 1.25, 4.75].map((x) => x + 100));
  assert.deepEqual([1, 2, 3, 4].map(base), [50, 50, 50, 50]);
  // line 2: o 0..3, r 3.5..5.5: 5.5 wide, centred; 6 below
  assert.deepEqual([5, 6].map(left), [-2.75, 0.75].map((x) => x + 100));
  assert.deepEqual([5, 6].map(base), [44, 44]);
  assert.deepEqual(Object.keys(res.sheets).map(Number), [1, 2, 3, 4, 5, 6], 'the letters are on the text’s sheet');
});
test('two blocks: the second reads its classes by number, and each is placed by its own numbers', () => {
  const second = { settings: STRAIGHT(0, 'Hi'), box: [0, 0, 6, 4], m: [1, 0, 0, 0, 1, -30], lines: [{ words: [[letter('H', 1.5, 3.5), letter('i', 1, 2.5)]] }] };
  const { res, contours } = readBack([TWO_LINES, second]);
  assert.equal(res.placed, 2); assert.deepEqual(res.left, []);
  // H is 0..3 with the pen moving on 3.5; i is 2 wide with its centre 1 past the pen: 3.5..5.5
  assert.deepEqual([contours[6][0], contours[7][0]], [[0, -30, 0], [3.5, -30, 0]], 'set left: from the box’s left edge');
});
test('text on a curve is read with its curve, and its letters turned along it', () => {
  const s = STRAIGHT(2, 'AB').filter((x) => !/^_txtblk/.test(x[0])).concat([['_txtblkIsOnCurve', 2, true], ['_txtblkKeepSize', 2, true], ['_txtblkReverseCurve', 2, false], ['_txtblkCurveAlign', 1, 0],
    ['_txtblkFillPercent', 0, 100], ['_txtblkJustification', 1, 2], ['_txtblkOrientation', 1, 1], ['_txtblkOffsetDistance', 0, 0], ['_txtblkSpacingValue', 0, 1]]);
  const R = 20, curve = [{ x0: -R, y0: 0, x1: R, y1: 0, b: -1 }];                 // a half circle over the top
  const { res, contours } = readBack([{ settings: s, box: [-9, 0, 9, 24], m: ID, lines: [{ words: [[letter('A', 2, 5), letter('B', 2, 5)]] }], curve }]);
  assert.equal(res.placed, 1); assert.deepEqual(res.left, []);
  // in a row A is 0..4 and B 5..9, so their centres are 2.5 each side of the middle of the arc, which is its top
  for (const [i, side] of [[0, -1], [1, 1]]) {
    const a = 2.5 / R, mid = [(contours[i][0][0] + contours[i][1][0]) / 2, (contours[i][0][1] + contours[i][1][1]) / 2];
    near(mid[0], side * R * Math.sin(a), 1e-9, 'its foot on the arc, across'); near(mid[1], R * Math.cos(a), 1e-9, 'and up');
    near(Math.atan2(contours[i][1][1] - contours[i][0][1], contours[i][1][0] - contours[i][0][0]), -side * a, 1e-9, 'turned to the arc');
  }
});
test('text 454 hasn’t seen the like of is left out and named; the rest of the drawing stays', () => {
  const right = { settings: STRAIGHT(1, 'Set right'), box: [0, 0, 6, 4], m: ID, lines: [{ words: [[letter('S', 1.5, 3.5), letter('e', 1, 2.5)]] }] };
  const { res, contours } = readBack([TWO_LINES, right], [[[0, 0], [9, 0], [9, 9]]]);
  assert.equal(res.placed, 1);
  assert.deepEqual(res.left, [{ said: 'Set right', why: 'it’s set to the right' }]);
  assert.deepEqual(Object.keys(res.drop).map(Number), [7, 8], 'its two letters are to be left out');
  assert.deepEqual(contours[0], [[0, 0, 0], [9, 0, 0], [9, 9, 0]]);
  assert.equal(contours[1][0][0], 92.25, 'the first block is still placed');
});
test('text that can’t be read is left as it was found, and said to be unread', () => {
  const w = writer(); w.zeros(40);
  const outs = writeBlock(w, TWO_LINES), vd = w.bytes();
  const line1 = vd.indexOf(0xFF, 700);                                             // somewhere inside the letters: spoil a class
  const where = outs[1].end + 39 + 64;                                             // the class of the letter after "o"... which is the next word's
  vd[where] = 0x12; vd[where + 1] = 0x00;
  const contours = outs.map((o) => o.spans.map((s) => s.slice()));
  const res = plain(D.crvTextApply(vd, new DataView(vd.buffer), contours, outs.map((o) => o.at), outs.map((o) => o.end)));
  assert.equal(res.placed, 0);
  assert.equal(res.left.length, 1); assert.equal(res.left[0].unread, true); assert.match(res.left[0].why, /couldn’t be read \(no word where one should be\)/);
  assert.deepEqual(res.drop, {});
  assert.deepEqual(plain(contours), outs.map((o) => o.spans), 'nothing moved');
  assert.ok(line1 > 0);
});
test('a project with no text: nothing to do', () => {
  const vd = new Uint8Array(500);
  assert.deepEqual(plain(D.crvTextApply(vd, new DataView(vd.buffer), [], [], [])), { placed: 0, left: [], drop: {}, sheets: {} });
});

// ---- a real project, against VCarve's own export of it ----
// fixtures/vcarve-text.crv: a 12 x 9 x 1.25 in job zeroed at its centre, with a frame, a circle, a square, an arc,
// and three blocks of text in Arial: three lines fitted to a box and centred, two lines fitted to a box and set
// left, and a line set left on the arc (turned round, and sized to fit it).
// fixtures/vcarve-text.dxf is VCarve's export of the line on the arc: its eleven letter outlines. (An export of
// the whole drawing, from the same project with the line on the arc in another font, was checked by hand: all
// 74 shapes Design makes sat on their own DXF shape. With a whole export here, check all of them: see below.)
const here = path.dirname(fileURLToPath(import.meta.url));
function dxfShapes(file) {
  const lines = fs.readFileSync(file, 'latin1').split(/\r?\n/), shapes = [];
  let on = false, cur = null, vertex = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = +lines[i].trim(), v = lines[i + 1].trim();
    if (code === 2 && v === 'ENTITIES') { on = true; continue; }
    if (!on) continue;
    if (code === 0) {
      if (v === 'ENDSEC') break;
      vertex = v === 'VERTEX';
      if (v === 'POLYLINE') { cur = { layer: '', xs: [], ys: [] }; shapes.push(cur); } else if (v !== 'VERTEX' && v !== 'SEQEND') throw new Error('a ' + v + ' in the DXF: this reader only knows polylines');
      continue;
    }
    if (code === 8 && cur && !vertex) cur.layer = v;
    else if (code === 10 && vertex) cur.xs.push(+v);
    else if (code === 20 && vertex) cur.ys.push(+v);
  }
  return shapes.map((s) => ({ layer: s.layer, x0: Math.min(...s.xs), x1: Math.max(...s.xs), y0: Math.min(...s.ys), y1: Math.max(...s.ys) }));
}
test('a real VCarve project: its material, its text, and the letters on the curve where VCarve’s own export has them', () => {
  const buf = fs.readFileSync(path.join(here, 'fixtures/vcarve-text.crv'));
  const ex = D.crvExtract(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.deepEqual([ex.stockW, ex.stockH, ex.stockT, ex.stockZero], [12, 9, 1.25, 'top'], 'the material');
  assert.deepEqual(plain(ex.stockAt), [-6, -4.5], 'zeroed at its centre');
  assert.equal(ex.textPlaced, 3, 'three blocks of text placed');
  assert.deepEqual(plain(ex.textLeft), [], 'none left out');
  const doc = plain(D.crvToDoc(ex, 1));
  assert.equal(doc.stock.origin, 'center');
  // the frame, the circle, the square, and 71 letter outlines (39, 21 and 11). The arc the text sits on isn't one of
  // them: a shape of a single line or arc isn't read from a .crv yet (a gap older than this).
  assert.equal(doc.ents.length, 74);
  const boxes = doc.ents.map((e) => (e.t === 'circle' ? { x0: e.cx - e.r, x1: e.cx + e.r, y0: e.cy - e.r, y1: e.cy + e.r } : plain(D.crvSpansBox(e.pts.map((p) => [p[0], p[1], p[2] || 0])))));
  // every shape in the DXF is one of Design's, each its own, within 0.003 in
  const dxf = dxfShapes(path.join(here, 'fixtures/vcarve-text.dxf'));
  assert.equal(dxf.length, 11, 'the letters of the line on the arc');
  const used = new Set();
  dxf.forEach((d, i) => {
    let best = Infinity, at = -1;
    boxes.forEach((b, k) => { const err = Math.max(Math.abs(b.x0 - d.x0), Math.abs(b.x1 - d.x1), Math.abs(b.y0 - d.y0), Math.abs(b.y1 - d.y1)); if (err < best) { best = err; at = k; } });
    assert.ok(best < 0.003, `DXF shape ${i} is ${best.toFixed(4)} from the nearest of Design’s`);
    assert.ok(!used.has(at), `DXF shape ${i} is the same shape of Design’s as another`);
    used.add(at);
  });
  // the straight text: where it sits, from the project's own numbers (centred on the job, and set left)
  const top = Math.max(...boxes.map((b) => b.y1)), left = Math.min(...boxes.filter((b, k) => !used.has(k) && doc.ents[k].t !== 'circle').map((b) => b.x0));
  assert.ok(top <= 4.5 && left >= -6, 'everything is on the material');
});
