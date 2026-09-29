// 454 Design's file formats: reading DXF and SVG, writing DXF and SVG, and adding a file to a drawing.
// Run on Design's real source files (test/harness.mjs):  node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesign } from './harness.mjs';

const D = loadDesign();
// Design's code runs in its own context, with its own Array and Object: compare plain copies of what it makes
const plain = (v) => JSON.parse(JSON.stringify(v));
const eq = (a, b, m) => assert.deepEqual(plain(a), plain(b), m);
const near = (a, b, tol = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} is not ${b} (within ${tol})`);
const nearPt = (p, q, tol = 1e-6, what = '') => { near(p[0], q[0], tol, what + ' x'); near(p[1], q[1], tol, what + ' y'); };
const dxf = (...pairs) => pairs.flat().join('\n');
const ENTITIES = (...ents) => dxf('0', 'SECTION', '2', 'ENTITIES', ...ents, '0', 'ENDSEC', '0', 'EOF');

// ---- reading DXF ----
test('DXF: lines, circles and arcs, with their layers', () => {
  const x = D.dxfExtract(ENTITIES('0', 'LINE', '8', 'Cut', '10', '0', '20', '0', '11', '100', '21', '0',
                                  '0', 'CIRCLE', '8', 'Cut', '10', '50', '20', '50', '40', '10',
                                  '0', 'ARC', '8', 'Cut', '10', '0', '20', '0', '40', '20', '50', '0', '51', '90'));
  eq(x.ents.map((e) => e.t), ['line', 'circle', 'arc']);
  const [l, c, a] = x.ents;
  eq([l.x1, l.y1, l.x2, l.y2], [0, 0, 100, 0]);
  eq([c.cx, c.cy, c.r], [50, 50, 10]);
  near(a.a0, 0); near(a.a1, Math.PI / 2); assert.equal(a.ccw, true, 'DXF arcs run anticlockwise');
  assert.ok(x.ents.every((e) => e.dxfLayer === 'Cut'));
});
test('DXF: a polyline\u2019s bulges become arcs, anticlockwise positive', () => {
  const x = D.dxfExtract(ENTITIES('0', 'LWPOLYLINE', '8', '0', '90', '3', '70', '1', '10', '0', '20', '0', '42', '0', '10', '40', '20', '0', '42', '1', '10', '40', '20', '20'));
  const p = x.ents[0];
  assert.equal(p.t, 'path'); assert.equal(p.closed, true);
  eq(p.pts.map((q) => q[2] || 0), [0, 1, 0], 'a semicircle from (40,0) to (40,20)');
});
test('DXF: a block placed scaled and rotated lands exactly where it should', () => {
  // block B1: a circle at (5,0), r 2. Placed at (300,0), scale 2, rotated 90: (5,0) -> (10,0) -> (0,10) -> (300,10), r 4
  const x = D.dxfExtract(dxf('0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'B1', '10', '0', '20', '0', '0', 'CIRCLE', '8', '0', '10', '5', '20', '0', '40', '2', '0', 'ENDBLK', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '8', 'Cut', '2', 'B1', '10', '300', '20', '0', '41', '2', '42', '2', '50', '90', '0', 'ENDSEC', '0', 'EOF'));
  const c = x.ents[0];
  near(c.cx, 300); near(c.cy, 10); near(c.r, 4);
});
test('DXF: a spline ends on its end control points and stays inside its control polygon', () => {
  const ctrl = [[0, 0], [10, 20], [20, 20], [30, 0]];
  const x = D.dxfExtract(ENTITIES('0', 'SPLINE', '8', '0', '71', '3', '72', '8', '73', '4', ...[0, 0, 0, 0, 1, 1, 1, 1].flatMap((k) => ['40', String(k)]),
                                  ...ctrl.flatMap((p) => ['10', String(p[0]), '20', String(p[1])])));
  const s = x.ents[0];
  nearPt(s.pts[0], [0, 0], 1e-6, 'start'); nearPt(s.pts.at(-1), [30, 0], 1e-6, 'end');
  assert.ok(s.pts.length > 10, 'sampled finely');
  assert.ok(s.pts.every((p) => p[0] >= -1e-9 && p[0] <= 30 + 1e-9 && p[1] >= -1e-9 && p[1] <= 20), 'inside the control polygon');
  near(s.pts[Math.floor(s.pts.length / 2)][1], 15, 0.6, 'its middle, 3/4 of the way up (a cubic B\u00e9zier here)');
});
test('DXF: every point of an ellipse is on the ellipse', () => {
  const x = D.dxfExtract(ENTITIES('0', 'ELLIPSE', '8', '0', '10', '200', '20', '0', '11', '20', '21', '0', '40', '0.5', '41', '0', '42', String(2 * Math.PI)));
  const e = x.ents[0];
  assert.equal(e.closed, true);
  for (const p of e.pts) near(((p[0] - 200) / 20) ** 2 + (p[1] / 10) ** 2, 1, 1e-6, 'on the ellipse');
});
test('DXF: layers keep whether they were off or locked; units and unsupported entities are reported', () => {
  const x = D.dxfExtract(dxf('0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '0', 'LAYER', '2', 'Off', '62', '-7', '70', '0', '0', 'LAYER', '2', 'Locked', '62', '7', '70', '4', '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', 'Off', '10', '0', '20', '0', '11', '1', '21', '0', '0', 'LINE', '8', 'Locked', '10', '0', '20', '0', '11', '1', '21', '0',
    '0', 'TEXT', '8', '0', '10', '0', '20', '0', '1', 'hi', '0', 'ENDSEC', '0', 'EOF'));
  eq(x.layers, [{ name: 'Off', visible: false, locked: false }, { name: 'Locked', visible: true, locked: true }]);
  assert.equal(x.units, 1, 'inches');
  eq(x.skipped, { TEXT: 1 });
});

// ---- writing DXF, and reading it back ----
test('DXF: everything Design exports comes back as the same geometry, on its layers', () => {
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }, { id: 'L2', name: 'Holes', visible: false, locked: true }];
  D.DOC.activeLayer = 'L1';
  const path = { t: 'path', pts: [[10, 0, 0], [90, 0, 0.4142], [100, 10, 0], [100, 50, -0.5], [0, 50, 0]], closed: true, layer: 'L1' };
  D.DOC.ents = [
    { t: 'line', x1: 0, y1: 0, x2: 100, y2: 0, layer: 'L1' },
    { t: 'circle', cx: 50, cy: 50, r: 10, layer: 'L2' },
    { t: 'arc', cx: 0, cy: 0, r: 20, a0: Math.PI / 2, a1: 0, ccw: false, layer: 'L1' },      // clockwise
    { t: 'rect', x: 10, y: 20, w: 30, h: 40, layer: 'L1' },
    path,
    { t: 'line', x1: 0, y1: 5, x2: 50, y2: 5, con: true, layer: 'L1' },
  ];
  const back = D.dxfExtract(D.dxfExport().text);
  const [l, c, a, r, p, k] = back.ents;
  eq([l.x1, l.y1, l.x2, l.y2], [0, 0, 100, 0]);
  eq([c.cx, c.cy, c.r, c.dxfLayer], [50, 50, 10, 'Holes']);
  // DXF stores arcs anticlockwise: the clockwise quarter comes back as the same quarter, drawn the other way
  near(a.r, 20); eq([a.a0, a.a1, a.ccw].map((v) => typeof v === 'number' ? +v.toFixed(9) : v), [0, +(Math.PI / 2).toFixed(9), true]);
  assert.equal(r.t, 'poly', 'a rectangle comes back as its outline'); eq(r.pts, [[10, 20], [40, 20], [40, 60], [10, 60]]);
  eq(p.pts.map((q) => q.map((v) => +v.toFixed(4))), path.pts, 'bulges and all');
  assert.equal(k.dxfLayer, 'Construction', 'construction lines on their own layer');
  eq(back.layers.find((L) => L.name === 'Holes'), { name: 'Holes', visible: false, locked: true });
});

// ---- reading SVG ----
test('SVG: millimetre sizes, with Y turned up', () => {
  const x = D.svgExtract('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><rect x="10" y="5" width="30" height="20"/><circle cx="70" cy="25" r="10"/></svg>');
  const [r, c] = x.ents;
  eq([r.t, r.x, r.y, r.w, r.h], ['rect', 10, 25, 30, 20], 'y 5..25 from the top is 25..45 from the bottom');
  eq([c.t, c.cx, c.cy, c.r], ['circle', 70, 25, 10]);
});
test('SVG: units: px at 96 per inch, inches, and a viewBox scale', () => {
  const px = D.svgExtract('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><line x1="0" y1="0" x2="96" y2="0"/></svg>').ents[0];
  near(px.x2 - px.x1, 25.4, 1e-9, '96 px');
  const inch = D.svgExtract('<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in" viewBox="0 0 200 100"><line x1="0" y1="0" x2="100" y2="0"/></svg>').ents[0];
  near(inch.x2 - inch.x1, 25.4, 1e-9, 'half of a 2 in wide viewBox');
});
test('SVG: a circular arc stays an arc, bulging the right way', () => {
  // from (10,45) to (20,45), sweep 1: on screen it rises (y down) to (15,40); in Design (y up) it's above
  const p = D.svgExtract('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><path d="M 10 45 A 5 5 0 0 1 20 45"/></svg>').ents[0];
  assert.equal(p.t, 'path');
  assert.ok(p.pts.slice(0, -1).every((q) => Math.abs(q[2] + Math.tan(Math.PI / 8)) < 1e-9), 'two clockwise quarter turns');
});
test('SVG: a B\u00e9zier curve is followed within 0.02 mm', () => {
  const c = D.svgExtract('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><path d="M50 40 C 55 30, 65 30, 70 40"/></svg>').ents[0];
  const bz = (t) => { const u = 1 - t; return [u*u*u*50 + 3*u*u*t*55 + 3*u*t*t*65 + t*t*t*70, 50 - (u*u*u*40 + 3*u*u*t*30 + 3*u*t*t*30 + t*t*t*40)]; };
  let worst = 0;
  for (let i = 0; i <= 400; i++) {
    const q = bz(i / 400); let best = Infinity;
    for (let j = 0; j + 1 < c.pts.length; j++) {
      const a = c.pts[j], b = c.pts[j + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx*dx + dy*dy;
      const t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0])*dx + (q[1] - a[1])*dy) / L2)) : 0;
      best = Math.min(best, Math.hypot(q[0] - a[0] - t*dx, q[1] - a[1] - t*dy));
    }
    worst = Math.max(worst, best);
  }
  assert.ok(worst <= 0.02, 'worst ' + worst.toFixed(4) + ' mm');
});
test('SVG: group transforms apply; an unevenly scaled circle becomes an ellipse', () => {
  const x = D.svgExtract('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><g transform="translate(50,50) rotate(90)"><rect x="0" y="0" width="20" height="10"/></g><g transform="scale(2,1)"><circle cx="10" cy="80" r="5"/></g></svg>');
  const [r, e] = x.ents;
  nearPt(r.pts[1], [50, 30], 1e-9, 'the rotated corner (20,0)');
  assert.equal(e.t, 'poly');
  for (const q of e.pts) near(((q[0] - 20) / 10) ** 2 + ((q[1] - 20) / 5) ** 2, 1, 0.01, 'on the stretched circle');
});
test('SVG: Inkscape layers (hidden ones hidden), and what isn\u2019t imported is counted', () => {
  const x = D.svgExtract('<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="50mm" height="50mm" viewBox="0 0 50 50">' +
    '<g inkscape:groupmode="layer" inkscape:label="Outline"><rect x="1" y="1" width="48" height="48"/></g>' +
    '<g inkscape:groupmode="layer" inkscape:label="Holes" style="display:none"><circle cx="10" cy="10" r="2"/></g>' +
    '<text x="5" y="5">hi</text><path d="m5 5 l10 0 l0 10z" style="display:none"/></svg>');
  eq(x.ents.map((e) => e.dxfLayer), ['Outline', 'Holes'], 'the hidden path is skipped; the hidden layer isn\u2019t');
  eq(x.layers, [{ name: 'Outline', visible: true, locked: false }, { name: 'Holes', visible: false, locked: false }]);
  eq(x.skipped, { text: 1 });
});
test('SVG: what Design exports comes back exactly, where it was', () => {
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'path', closed: true, layer: 'L1', pts: [[10, 0, 0], [90, 0, 0.4142], [100, 10, 0], [100, 50, 0.4142], [90, 60, 0], [10, 60, 0.4142], [0, 50, 0], [0, 10, 0.4142]] },
                { t: 'circle', cx: 50, cy: 30, r: 12, layer: 'L1' }, { t: 'line', x1: 5, y1: 70, x2: 95, y2: 70, layer: 'L1' }];
  const back = D.svgExtract(D.svgExport().text).ents;
  D.DOC.ents[0].pts.forEach((q, i) => { nearPt(back[0].pts[i], q, 1e-4, 'point ' + i); near(back[0].pts[i][2], q[2], 1e-4, 'bulge ' + i); });
  eq([back[1].cx, back[1].cy, back[1].r].map((v) => +v.toFixed(4)), [50, 30, 12]);
  eq([back[2].x1, back[2].y1, back[2].x2, back[2].y2].map((v) => +v.toFixed(4)), [5, 70, 95, 70]);
});

// ---- adding a file to a drawing ----
test('adding: layers join by name, the default layer is the active one, and nothing already there changes', () => {
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }, { id: 'L2', name: 'Holes', visible: true, locked: false }];
  D.DOC.activeLayer = 'L1';
  D.DOC.ents = [{ t: 'rect', x: 0, y: 0, w: 100, h: 50, layer: 'L1' }];
  D.DOC.toolpaths = [{ name: 'Outside profile', side: 'outside', srcIds: ['x'] }];
  const x = D.dxfExtract(ENTITIES('0', 'CIRCLE', '8', 'HOLES', '10', '5', '20', '5', '40', '2', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '10', '21', '0',
                                  '0', 'LINE', '8', 'Brand new', '10', '0', '20', '0', '11', '10', '21', '0'));
  const r = D.vecAdd(x, 1, 'beside', D.vecContentBBox());
  const added = r.idx.map((i) => D.DOC.ents[i]);
  eq(added.map((e) => D.layerById(e.layer).name), ['Holes', 'Layer 1', 'Brand new'], 'matched without case, the default on the active layer, a new one made');
  assert.equal(D.DOC.ents[0].w, 100, 'the rectangle is untouched');
  assert.equal(D.DOC.toolpaths.length, 1, 'the toolpath is still there');
  near(r.bb.x0, 110, 1e-9, 'beside: 10 mm to the right'); near(r.bb.y0, 0, 1e-9, 'bottoms aligned');
});
test('adding: at X0 Y0, or where the file has them', () => {
  D.DOC.layers = [{ id: 'L1', name: 'Layer 1', visible: true, locked: false }]; D.DOC.activeLayer = 'L1'; D.DOC.ents = [];
  const x = D.dxfExtract(ENTITIES('0', 'CIRCLE', '8', '0', '10', '50', '20', '40', '40', '5'));
  near(D.vecAdd(x, 1, 'origin', null).bb.x0, 0, 1e-9, 'at the origin');
  near(D.vecAdd(x, 1, 'file', null).bb.x0, 45, 1e-9, 'where the file has it');
  near(D.vecAdd(x, 25.4, 'file', null).bb.x0, 45 * 25.4, 1e-6, 'inches scaled to millimetres');
});
