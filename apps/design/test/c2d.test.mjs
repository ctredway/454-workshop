// Opening Carbide Create projects (c2d-import.js): the page reads the .c2d database itself (sqliteTables),
// unpacks its compressed text itself (zInflate), and turns the job and its shapes into a 454 drawing. Checked
// against two real files saved by Carbide Create build 870 (fixtures/), against Node's own zlib and SQLite, and
// against projects made here to cover what those two files don't. On Design's real sources:
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadDesign } from './harness.mjs';

const D = loadDesign({ cam: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => new Uint8Array(fs.readFileSync(path.join(here, 'fixtures', name)));
const plain = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, (msg || '') + `: ${a} against ${b}`);
const el = (id) => D.document.getElementById(id);

// a database file made with Node's SQLite, as bytes
function database(fill, pageSize) {
  const file = path.join(os.tmpdir(), 'p454-c2d-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.db');
  const db = new DatabaseSync(file);
  try { if (pageSize) db.exec('PRAGMA page_size = ' + pageSize); fill(db); } finally { db.close(); }
  const bytes = new Uint8Array(fs.readFileSync(file));
  fs.unlinkSync(file);
  return bytes;
}
// a Carbide Create project made here: the job's settings, and items as Carbide Create stores them
function project(params, items) {
  return database((db) => {
    db.exec('CREATE TABLE params( key TEXT PRIMARY KEY, -- name of the parameter\n value TEXT -- value\n )');
    db.exec('CREATE TABLE items( id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT UNIQUE, name TEXT, -- optional, for debugging\n type TEXT, version TEXT, sz INT, data BLOB )');
    const p = db.prepare('INSERT INTO params VALUES (?, ?)');
    Object.entries(Object.assign({ width: '300', height: '200', thickness: '18', display_mm: '1', zero_x: '0.0', zero_y: '0.0', zero_z: '0.0', build_num: '870' }, params)).forEach(([k, v]) => p.run(k, String(v)));
    const it = db.prepare('INSERT INTO items (uuid, name, type, version, sz, data) VALUES (?, ?, ?, ?, ?, ?)');
    items.forEach((x, i) => {
      const text = Buffer.from(typeof x.json === 'string' ? x.json : JSON.stringify(x.json));
      it.run(x.uuid || 'u' + i, x.name || '', x.type, 'J1', text.length, x.raw ? text : zlib.deflateSync(text));   // as it happens, the layer's packs to its own length
    });
  });
}
const LAYER = { name: 'DEFAULT', visible: true, locked: false, uuid: '', red: 0, green: 0, blue: 0 };
const shape = (o) => ({ type: 'element', json: Object.assign({ layer: LAYER, position: [0, 0], group_id: [], tabs: [] }, o) });

test('unpacking: the same bytes Node’s zlib gives, however they were packed', () => {
  const rnd = Buffer.alloc(70000); let s = 12345; for (let i = 0; i < rnd.length; i++) { s = (s * 1103515245 + 12345) >>> 0; rnd[i] = s >>> 24; }
  const texts = { empty: Buffer.alloc(0), short: Buffer.from('{"a":1}'), repeats: Buffer.from('abcabcabc '.repeat(5000)),
    json: Buffer.from(JSON.stringify({ points: Array.from({ length: 4000 }, (_, i) => [i * 0.37, Math.sin(i) * 100]) })), random: rnd };
  for (const [name, buf] of Object.entries(texts)) {
    for (const level of [0, 1, 6, 9]) {
      const out = D.zInflate(new Uint8Array(zlib.deflateSync(buf, { level })));
      assert.equal(Buffer.compare(Buffer.from(out), buf), 0, name + ' at level ' + level);
    }
    const fixed = D.zInflate(new Uint8Array(zlib.deflateSync(buf, { strategy: zlib.constants.Z_FIXED })));
    assert.equal(Buffer.compare(Buffer.from(fixed), buf), 0, name + ', fixed codes');
  }
  assert.throws(() => D.zInflate(new Uint8Array([1, 2, 3, 4, 5, 6, 7])), /packed/);
  const cut = zlib.deflateSync(texts.json); assert.throws(() => D.zInflate(new Uint8Array(cut.subarray(0, cut.length >> 1))), /ends early|damaged/);
});
test('the database reader: the rows Node’s SQLite wrote, across many pages and long values', () => {
  const big = Buffer.alloc(300000); for (let i = 0; i < big.length; i++) big[i] = (i * 7 + (i >> 8)) & 255;
  for (const pageSize of [512, 4096, 65536]) {
    const bytes = database((db) => {
      db.exec('CREATE TABLE things( id INTEGER PRIMARY KEY, name TEXT, -- a name, with a comma\n n INT, x REAL, data BLOB, CHECK (n > -999999999999) )');
      db.exec('CREATE TABLE "empty one"( a, b )');
      const q = db.prepare('INSERT INTO things (name, n, x, data) VALUES (?, ?, ?, ?)');
      for (let i = 0; i < 700; i++) q.run('row ' + i + ' é\u2713', i % 2 ? -i * 1000003 : i, i / 7, i % 100 ? null : Buffer.from('b' + i));
      q.run('long', 2 ** 40 + 5, -0.5, big);
      q.run(null, 0, 1, Buffer.alloc(0));
    }, pageSize);
    const t = D.sqliteTables(bytes);
    assert.deepEqual(Object.keys(plain(t)).sort(), ['empty one', 'things'], 'page size ' + pageSize);
    assert.equal(t.things.length, 702); assert.equal(t['empty one'].length, 0);
    const r5 = t.things[5], r100 = t.things[100], long = t.things[700], last = t.things[701];
    assert.equal(r5.id, 6, 'the id column, which the file leaves to the row’s own number');
    assert.deepEqual(Array.from(Object.keys(r5)), ['id', 'name', 'n', 'x', 'data'], 'the columns, without the table’s CHECK rule');
    assert.equal(r5.name, 'row 5 é\u2713'); assert.equal(r5.n, -5000015); near(r5.x, 5 / 7); assert.equal(r5.data, null);
    assert.equal(Buffer.from(r100.data).toString(), 'b100');
    assert.equal(long.n, 2 ** 40 + 5); assert.equal(long.x, -0.5);
    assert.equal(Buffer.compare(Buffer.from(long.data), big), 0, 'a 300 KB value, over many overflow pages');
    assert.equal(last.name, null); assert.equal(last.n, 0); assert.equal(last.x, 1); assert.equal(last.data.length, 0);
  }
  assert.throws(() => D.sqliteTables(new Uint8Array(200)), /database/);
});
test('Circle.c2d, as Carbide Create saved it: the material, and a circle', () => {
  const ex = D.c2dExtract(fixture('Circle.c2d'));
  assert.equal(ex.build, 870); assert.equal(ex.elements.length, 1); assert.equal(ex.toolpaths.length, 1); assert.equal(ex.layers.length, 1);
  assert.deepEqual(plain(ex.skipped), {});
  const r = D.c2dToDoc(ex, 'Circle.c2d');
  assert.deepEqual(plain(r.doc.stock), { w: 203.2, h: 203.2, origin: 'corner', t: 25.4, zero: 'top' });
  assert.equal(r.inches, true, 'the project shows inches');
  assert.equal(r.doc.ents.length, 1);
  const c = plain(r.doc.ents[0]);
  assert.equal(c.t, 'circle'); near(c.cx, 101.6); near(c.cy, 101.6); near(c.r, 31.75);
  assert.equal(c.ccId, '{705490ad-9dff-47c2-827d-21b7f078cf9a}', 'Carbide Create’s ID is kept, for its toolpaths');
  assert.deepEqual(plain(r.doc.layers), [{ id: 'L1', name: 'DEFAULT', visible: true, locked: false }]); assert.equal(c.layer, 'L1');
  assert.equal(r.doc.name, 'Circle'); assert.equal(r.toolpaths, 1); assert.deepEqual(plain(r.notes), []);
});
test('Rectangle.c2d: a rectangle, 2 by 2.25 inches, in the middle', () => {
  const r = D.c2dToDoc(D.c2dExtract(fixture('Rectangle.c2d')), 'Rectangle.c2d');
  assert.equal(r.doc.ents.length, 1);
  const e = plain(r.doc.ents[0]);
  assert.equal(e.t, 'rect'); near(e.w, 50.8); near(e.h, 57.15); near(e.x, 101.6 - 25.4); near(e.y, 101.6 - 28.575);
  // one that's been turned isn't a plain rectangle any more: it keeps its real corners
  const turned = { position: [50, 50], geometryType: 'rectangle', corner_type: 0, width: 40, height: 20,
    points: [[10, -20], [20, 10], [-10, 20], [-20, -10], [10, -20], [0, 0]], point_type: [0, 1, 1, 1, 1, 4] };
  const t = plain(D.c2dToDoc(D.c2dExtract(project({}, [shape(turned)])), 'Turned.c2d').doc.ents);
  assert.equal(t[0].t, 'poly'); assert.deepEqual(t[0].pts, [[60, 30], [70, 60], [40, 70], [30, 40]]);
});
test('other shapes: lines, curves, open paths, several outlines in one shape, layers', () => {
  const k = 0.5522847498 * 20;                                      // a circle of radius 20 as four curves, not marked a circle
  const round = { position: [100, 80], geometryType: 'path',
    points: [[-20, 0], [0, 20], [20, 0], [0, -20], [-20, 0], [0, 0]], point_type: [0, 3, 3, 3, 3, 4],
    cp1: [[0, 0], [-20, k], [k, 20], [20, -k], [-k, -20], [0, 0]], cp2: [[0, 0], [-k, 20], [20, k], [k, -20], [-20, -k], [0, 0]] };
  const tri = { position: [10, 10], points: [[0, 0], [30, 0], [0, 40], [0, 0], [0, 0]], point_type: [0, 1, 1, 1, 4], layer: { name: 'Parts', visible: false, locked: true } };
  const open = { position: [0, 0], points: [[5, 5], [50, 5], [50, 30]], point_type: [0, 1, 1] };
  const seg = { position: [200, 0], points: [[0, 0], [0, 25]], point_type: [0, 1] };
  const two = { position: [150, 100], points: [[0, 0], [10, 0], [10, 10], [0, 0], [20, 20], [30, 20], [30, 30], [0, 0]], point_type: [0, 1, 1, 4, 0, 1, 1, 4], id: '{two}' };
  const rr = { position: [60, 150], geometryType: 'rectangle', corner_type: 1, radius: 5, width: 40, height: 20,
    points: [[-15, -10], [15, -10], [20, -5], [20, 5], [15, 10], [-15, 10], [-20, 5], [-20, -5], [-15, -10], [0, 0]], point_type: [0, 1, 3, 1, 3, 1, 3, 1, 3, 4],
    cp1: [[0, 0], [0, 0], [18, -10], [0, 0], [20, 8], [0, 0], [-18, 10], [0, 0], [-20, -8], [0, 0]],
    cp2: [[0, 0], [0, 0], [20, -8], [0, 0], [18, 10], [0, 0], [-20, 8], [0, 0], [-18, -10], [0, 0]] };
  const bytes = project({}, [{ type: 'layer', json: LAYER }, shape(round), shape(tri), shape(open), shape(seg), shape(two), shape(rr),
    { type: 'toolpath', json: { type: 'pocket' } }, { type: 'toolpath', json: { type: 'cutout' } }, { type: 'model', json: 'not json at all' }]);
  const r = D.c2dToDoc(D.c2dExtract(bytes), 'Mixed.c2d');
  const e = plain(r.doc.ents);
  assert.deepEqual(e.map((x) => x.t + (x.closed === false ? ' open' : '')), ['poly', 'poly', 'poly open', 'line', 'poly', 'poly', 'poly']);
  assert.ok(e[0].pts.length > 16, 'the curves are followed closely: ' + e[0].pts.length + ' points');
  e[0].pts.forEach((p) => near(Math.hypot(p[0] - 100, p[1] - 80), 20, 'on the circle', 0.03));
  assert.deepEqual(e[1].pts, [[10, 10], [40, 10], [10, 50]], 'measured from its position, without the repeated last point');
  assert.deepEqual(e[2].pts, [[5, 5], [50, 5], [50, 30]]);
  assert.deepEqual([e[3].x1, e[3].y1, e[3].x2, e[3].y2], [200, 0, 200, 25]);
  assert.deepEqual([e[4].pts, e[5].pts], [[[150, 100], [160, 100], [160, 110]], [[170, 120], [180, 120], [180, 130]]], 'two outlines in one shape');
  assert.equal(e[4].ccId, '{two}'); assert.equal(e[5].ccId, '{two}');
  assert.ok(e[6].t === 'poly' && e[6].pts.length > 8, 'a rounded rectangle keeps its corners');
  assert.deepEqual(plain(r.doc.layers), [{ id: 'L1', name: 'DEFAULT', visible: true, locked: false }, { id: 'L2', name: 'Parts', visible: false, locked: true }]);
  assert.equal(e[1].layer, 'L2'); assert.equal(e[0].layer, 'L1');
  assert.equal(r.inches, false); assert.equal(r.toolpaths, 2); assert.deepEqual(plain(r.notes), []);
  assert.deepEqual(plain(r.doc.stock), { w: 300, h: 200, origin: 'corner', t: 18, zero: 'top' });
});
test('what 454 can’t read is said, not guessed', () => {
  const odd = { points: [[0, 0], [10, 0], [10, 10], [0, 0]], point_type: [0, 1, 7, 4] };
  const none = { points: [], point_type: [] };
  const bytes = project({ zero_z: '18.0', thickness: '0' }, [shape(odd), shape(none), { type: 'element', json: '{broken' }, { type: 'toolpath', json: { a: 1 }, raw: true }]);
  const ex = D.c2dExtract(bytes);
  assert.equal(ex.toolpaths.length, 1, 'text stored without packing is read too');
  const r = D.c2dToDoc(ex, 'Odd.c2d');
  const notes = plain(r.notes).join(' | ');
  assert.match(notes, /kind of point 454 doesn.t know yet \(7\)/);
  assert.match(notes, /1 shape had nothing 454 could draw/);
  assert.match(notes, /Zero isn.t at the lower-left corner and the top/);
  assert.match(notes, /1 element item couldn.t be read/);
  assert.equal(r.doc.stock.t, undefined, 'no thickness in the project: none set');
  assert.equal(r.doc.ents.length, 1);
  assert.throws(() => D.c2dExtract(database((db) => db.exec('CREATE TABLE t(a)'))), /not a Carbide Create project/);
});
test('opening one: it becomes the drawing, in its units, unsaved, and Save won’t go to the last drawing’s file', () => {
  D.DOC.ents = [{ t: 'rect', x: 1, y: 2, w: 3, h: 4, layer: 'L1' }]; D.DOC.name = 'Before';
  D.SAVE_HANDLE = { name: 'before.454.json' }; D.lsSet(D.PATH_KEY, 'C:/work/before.454.json'); D.markSaved('before.454.json'); D.markUnsaved();   // from a file, changed since
  D.UICFG.stockUnits = 'mm';
  const toasts = []; const real = D.toast; D.toast = (k, t, b) => toasts.push(k + ' | ' + t + ' | ' + b);
  try {
    assert.equal(D.c2dIs(fixture('Circle.c2d')), true); assert.equal(D.c2dIs(new Uint8Array(500)), false);
    D.c2dOpen(fixture('Circle.c2d'), 'Circle.c2d');
    assert.equal(D.DOC.ents.length, 1); assert.equal(D.DOC.ents[0].t, 'circle'); assert.equal(D.DOC.name, 'Circle');
    assert.equal(D.UICFG.stockUnits, 'in');
    assert.equal(el('stkT').value, '1', 'Job setup shows the thickness, in inches');
    assert.equal(D.SAVE_HANDLE, null); assert.equal(D.lsGet(D.PATH_KEY), null, 'the last drawing’s file is forgotten');
    assert.equal(D.drawingUnsaved(), true, 'not saved as a 454 drawing yet');
    assert.equal(D.drawingFileName(), 'Circle.454.json', 'and Save offers its own name');
    assert.match(toasts[0], /^ok \| Opened Circle\.c2d \| 1 shape on 8\.000 × 8\.000 in material, 1\.000 in thick\. Its toolpath isn.t brought in yet/);
    assert.ok(D.asideRead(), 'the drawing before is kept for Recover');
    D.doUndo(); assert.equal(D.DOC.ents[0].t, 'rect', 'and Undo brings it back');
    // a file that isn't one: nothing changes
    const cut = fixture('Circle.c2d').subarray(0, 6000);
    assert.throws(() => D.c2dOpen(cut, 'Cut.c2d'));
    assert.throws(() => D.c2dOpen(project({}, [{ type: 'toolpath', json: { type: 'pocket' } }]), 'Empty.c2d'), /no shapes/);
    assert.equal(D.DOC.ents[0].t, 'rect');
  } finally { D.toast = real; D.UICFG.stockUnits = 'mm'; }
});
