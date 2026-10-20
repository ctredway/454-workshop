// The parts bin's shapes (parts-bin/geometry.js), checked against Clint's design in SolidCraft: the volumes and
// sizes SolidCraft measured on 2026-10-17, from its exact geometry. Ours are made of flat facets, so they come out a
// hair smaller; with fine facets, within 0.05%.  node --test 'apps/gadgets/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Module from '../vendor/manifold-3d/manifold.js';
import { DEFAULTS, derived, problems, frame, insert } from '../parts-bin/geometry.js';

const M = await Module();
M.setup();
const fine = { seg: 48, filletSteps: 24 };
const near = (got, want, what, rel = 5e-4) => assert.ok(Math.abs(got - want) <= Math.abs(want) * rel, `${what}: ${got} (SolidCraft ${want})`);
const box = (s) => { const b = s.boundingBox(); return [...b.min, ...b.max].map((v) => Math.round(v * 1000) / 1000); };
const P = (o) => Object.assign({}, DEFAULTS, o);

test('the standard Insert (1 slot, 1.3 mm corners), as SolidCraft measured it', () => {
  const s = insert(M, P({}), 1, fine);
  assert.equal(s.status(), 'NoError');
  assert.deepEqual(box(s), [-14.925, -9.8, 0, 14.925, 9.8, 4.8]);
  near(s.volume(), 1119.2235014101586, 'volume');
  near(s.surfaceArea(), 1882.9029603722474, 'surface area', 2e-3);
});
test('a 2-slot Insert for a 100 mm, 3-slot, 12 mm Frame, with the corners as they were then (1.5 mm)', () => {
  // SolidCraft measured it before its outside corners were made concentric with the Frame's (CornerR - Clear)
  const s = insert(M, P({ TrayL: 100, TrayH: 12, Units: 3 }), 2, Object.assign({ outerR: 1.5 }, fine));
  assert.equal(s.status(), 'NoError');
  assert.deepEqual(box(s), [-31.8, -9.8, 0, 31.8, 9.8, 10.8]);
  near(s.volume(), 3374.9884391404407, 'volume');
});
test('the Frame, 100 mm, 3 slots, 12 mm, with the notches as they were then (centred on the wall top)', () => {
  const p = P({ TrayL: 100, TrayH: 12, Units: 3, NotchDepth: 4.5 });
  const s = frame(M, p, fine);
  assert.equal(s.status(), 'NoError');
  assert.deepEqual(box(s), [-50, -12, 0, 50, 12, 13]);
  near(s.volume(), 7762.354643090478, 'volume');
  near(s.surfaceArea(), 10181.016429049343, 'surface area', 2e-3);
});

// ---- how the parts go together: every insert drops in, and Frames stack and interlock ----
const overlap = (a, b) => a.intersect(b).volume();
test('inserts filling every slot sit inside the Frame, clear of it and of each other, at both heights', () => {
  for (const TrayH of [6, 12]) {
    const p = P({ TrayH }), d = derived(p), f = frame(M, p);
    // 1 + 2 + 1 slots: each insert in the middle of its slots, on the Frame's floor
    let at = -d.PocketL / 2;
    const placed = [1, 2, 1].map((u) => { const s = insert(M, p, u).translate([at + u * d.Pitch / 2, 0, p.Floor]); at += u * d.Pitch; return s; });
    for (const s of placed) assert.ok(overlap(f, s) < 1e-6, `TrayH ${TrayH}: an insert hits the Frame (${overlap(f, s)} mm³)`);
    assert.ok(overlap(placed[0], placed[1]) < 1e-6 && overlap(placed[1], placed[2]) < 1e-6, 'inserts hit each other');
    // flush with the top of the walls, under the rim
    for (const s of placed) assert.equal(Math.round(s.boundingBox().max[2] * 1000) / 1000, TrayH);
    // and a hair too big would hit it: the clearance is what lets it in
    const tight = insert(M, P({ TrayH, Clear: -0.05 }), 1).translate([-d.PocketL / 2 + d.Pitch / 2, 0, p.Floor]);
    assert.ok(overlap(f, tight) > 0.1, 'a 0.05 mm oversize insert fits too: the check isn’t checking');
  }
});
test('a Frame stacked on another sits on its walls inside the rim, and the rim stops it sliding', () => {
  for (const TrayH of [6, 12]) {
    const p = P({ TrayH }), lower = frame(M, p), upper = frame(M, p).translate([0, 0, TrayH]);
    assert.ok(overlap(lower, upper) < 1e-6, `TrayH ${TrayH}: stacked Frames collide (${overlap(lower, upper)} mm³)`);
    assert.ok(overlap(lower, frame(M, p).translate([0, 0, TrayH - 0.1])) > 0.1, 'it would sink lower: it isn’t resting on the walls');
    for (const [dx, dy] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]])
      assert.ok(overlap(lower, frame(M, p).translate([dx, dy, TrayH])) > 0.1, `it slides ${dx || dy} mm without hitting the rim`);
  }
});
test('settings that can’t make a sound part are named, in words', () => {
  assert.deepEqual(problems(P({})), []);
  assert.deepEqual(problems(P({ TrayH: 12 })), []);
  assert.match(problems(P({ Units: 0 })).join(' '), /at least 1 slot/);
  assert.match(problems(P({ Units: 30 })).join(' '), /slots are too short/);
  assert.deepEqual(problems(P({ Units: 12, notches: false })), [], '12 slots of 10 mm still hold a small insert');
  assert.match(problems(P({ TrayW: 6 })).join(' '), /too narrow/);
  assert.match(problems(P({ Clear: 2 })).join(' '), /clearance can’t be more than the corner radius/);
  assert.match(problems(P({ NotchDepth: 9 })).join(' '), /notches don’t fit/);
  assert.deepEqual(problems(P({ NotchDepth: 9, notches: false })), [], 'no notches: their size doesn’t matter');
});

// ---- the 3MF file, read back by Python's own zip and XML readers, not ours ----
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { make3mf } from '../parts-bin/threemf.js';
import { partsFor } from '../parts-bin/geometry.js';

const READ = `
import sys, zipfile, json, xml.etree.ElementTree as ET
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
raw = open(sys.argv[1], 'rb').read()
import struct
for i in z.infolist():   # each file's own header agrees with the index (some readers go by one, some the other)
    sig, crc, csize, usize, nlen = struct.unpack('<I10xIIIH', raw[i.header_offset:i.header_offset + 28])
    assert (sig, crc, csize, usize) == (0x04034b50, i.CRC, i.compress_size, i.file_size), i.filename
    assert raw[i.header_offset + 30:i.header_offset + 30 + nlen].decode() == i.filename
names = z.namelist()
ns = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
root = ET.fromstring(z.read('3D/3dmodel.model'))
ct = ET.fromstring(z.read('[Content_Types].xml')); rels = ET.fromstring(z.read('_rels/.rels'))
out = {'names': names, 'unit': root.get('unit'), 'objects': [], 'items': [],
       'rel': [r.get('Target') for r in rels], 'types': sorted(d.get('Extension') for d in ct)}
for o in root.find('m:resources', ns):
    v = [(float(e.get('x')), float(e.get('y')), float(e.get('z'))) for e in o.find('m:mesh/m:vertices', ns)]
    t = [(int(e.get('v1')), int(e.get('v2')), int(e.get('v3'))) for e in o.find('m:mesh/m:triangles', ns)]
    edges = {}
    for a, b, c in t:
        for e in ((a, b), (b, c), (c, a)): edges[e] = edges.get(e, 0) + 1
    closed = all(n == 1 and edges.get((e[1], e[0])) == 1 for e, n in edges.items())
    vol = sum((v[a][0] * (v[b][1] * v[c][2] - v[b][2] * v[c][1]) - v[a][1] * (v[b][0] * v[c][2] - v[b][2] * v[c][0]) + v[a][2] * (v[b][0] * v[c][1] - v[b][1] * v[c][0])) for a, b, c in t) / 6
    zs = [p[2] for p in v]
    out['objects'].append({'id': o.get('id'), 'name': o.get('name'), 'closed': closed, 'volume': vol, 'zmin': min(zs), 'tris': len(t)})
for i in root.find('m:build', ns): out['items'].append({'objectid': i.get('objectid'), 't': [float(x) for x in i.get('transform').split()]})
print(json.dumps(out))
`;
function readBack(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'p454-3mf-')), f = join(dir, 'bin.3mf'), py = join(dir, 'read.py');
  writeFileSync(f, bytes); writeFileSync(py, READ);
  // python3 on Linux; on Windows python (python3 there may be a stand-in that only offers the Microsoft Store)
  let last;
  for (const exe of ['python3', 'python']) {
    try { return JSON.parse(execFileSync(exe, ['-I', py, f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) { last = e; }
  }
  throw last;
}
test('the 3MF: a Frame and its inserts, each its own closed part, the right size, side by side on the plate', () => {
  const p = P({}), parts = partsFor(M, p, { frames: 1, inserts: { 1: 2, 2: 1 } });
  const bytes = make3mf(parts.map((x) => ({ name: x.name, mesh: x.solid.getMesh(), x: x.x, y: x.y })), 'Parts bin');
  const r = readBack(bytes);
  assert.deepEqual(r.names, ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']);
  assert.equal(r.unit, 'millimeter');
  assert.deepEqual(r.rel, ['/3D/3dmodel.model']);
  assert.deepEqual(r.types, ['model', 'rels']);
  assert.deepEqual(r.objects.map((o) => o.name), ['Tray 4 slots', 'Insert 2 slots (1)', 'Insert 1 slot (1)', 'Insert 1 slot (2)']);
  r.objects.forEach((o, i) => {
    assert.ok(o.closed, o.name + ': every edge shared by exactly two triangles, the right way round');
    assert.ok(Math.abs(o.volume - parts[i].solid.volume()) < parts[i].solid.volume() * 1e-4, o.name + ': its volume, read back, is the part’s (' + o.volume + ')');
    assert.ok(Math.abs(o.zmin) < 1e-9, o.name + ': flat on the plate');
  });
  // laid out apart: no two parts' outlines overlap
  const d = derived(p), outline = (x, i) => { const w = i === 0 ? p.TrayL : d.insL(parts[i].units), h = i === 0 ? p.TrayW : d.InsW; return [x.t[9] - w / 2, x.t[10] - h / 2, x.t[9] + w / 2, x.t[10] + h / 2]; };
  const boxes = r.items.map(outline);
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const [A, B] = [boxes[a], boxes[b]];
    assert.ok(A[2] <= B[0] || B[2] <= A[0] || A[3] <= B[1] || B[3] <= A[1], `parts ${a + 1} and ${b + 1} overlap on the plate`);
  }
});
test('a box left empty is named as the page names it', () => {
  assert.deepEqual(problems(P({ TrayL: NaN })), ['Length needs a number.']);
  assert.deepEqual(problems(P({ Clear: NaN, NotchDepth: NaN })), ['Clearance needs a number.', 'Notch depth needs a number.']);
});

// ---- STL: one file per kind of part, read back by Python ----
import { stlDownload } from '../parts-bin/stl.js';
const READ_STL = `
import sys, zipfile, struct, json, io
def part(name, b):
    assert not b[:5].lower() == b'solid', name + ': a binary STL must not start with solid'
    n = struct.unpack('<I', b[80:84])[0]
    assert len(b) == 84 + 50 * n, name + ': size and triangle count disagree'
    tris, edges, vol, bad = [], {}, 0.0, 0
    key = lambda p: tuple(round(c, 4) for c in p)
    for i in range(n):
        f = struct.unpack('<12fH', b[84 + 50 * i:134 + 50 * i])
        nrm, a, b2, c = f[0:3], f[3:6], f[6:9], f[9:12]
        u = [b2[k] - a[k] for k in range(3)]; w = [c[k] - a[k] for k in range(3)]
        cr = (u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0])
        if sum(cr[k] * nrm[k] for k in range(3)) < 0: bad += 1
        vol += (a[0]*(b2[1]*c[2]-b2[2]*c[1]) - a[1]*(b2[0]*c[2]-b2[2]*c[0]) + a[2]*(b2[0]*c[1]-b2[1]*c[0])) / 6
        A, B, C = key(a), key(b2), key(c)
        for e in ((A, B), (B, C), (C, A)): edges[e] = edges.get(e, 0) + 1
    closed = all(k == 1 and edges.get((e[1], e[0])) == 1 for e, k in edges.items())
    return {'name': name, 'tris': n, 'volume': vol, 'closed': closed, 'normalsWrong': bad}
data = open(sys.argv[1], 'rb').read()
out = [part(i.filename, zipfile.ZipFile(io.BytesIO(data)).read(i)) for i in zipfile.ZipFile(io.BytesIO(data)).infolist()] if data[:2] == b'PK' else [part('one', data)]
print(json.dumps(out))
`;
function readStl(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'p454-stl-')), f = join(dir, 'x.bin'), py = join(dir, 'read.py');
  writeFileSync(f, bytes); writeFileSync(py, READ_STL);
  let last;
  for (const exe of ['python3', 'python']) {
    try { return JSON.parse(execFileSync(exe, ['-I', py, f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch (e) { last = e; }
  }
  throw last;
}
test('STL: one file per kind of part, named with how many to print, each closed, facing out, the right size', () => {
  const p = P({}), parts = partsFor(M, p, { frames: 2, inserts: { 1: 2, 2: 1 } });
  const dl = stlDownload(parts.map((x) => ({ name: x.name, kind: x.kind, mesh: x.solid.getMesh() })), 'parts-bin.zip');
  assert.equal(dl.name, 'parts-bin.zip');
  const r = readStl(dl.bytes);
  assert.deepEqual(r.map((x) => x.name), ['Tray 4 slots - print 2.stl', 'Insert 2 slots - print 1.stl', 'Insert 1 slot - print 2.stl']);
  const want = { 'Tray 4 slots - print 2.stl': frame(M, p).volume(), 'Insert 2 slots - print 1.stl': insert(M, p, 2).volume(), 'Insert 1 slot - print 2.stl': insert(M, p, 1).volume() };
  for (const x of r) {
    assert.ok(x.closed, x.name + ': closed');
    assert.equal(x.normalsWrong, 0, x.name + ': every triangle faces out');
    assert.ok(Math.abs(x.volume - want[x.name]) < want[x.name] * 1e-4, x.name + ': volume ' + x.volume + ', not ' + want[x.name]);
  }
  // one kind of part: the STL itself, not a zip
  const one = stlDownload(partsFor(M, p, { frames: 0, inserts: { 1: 3 } }).map((x) => ({ name: x.name, kind: x.kind, mesh: x.solid.getMesh() })), 'parts-bin.zip');
  assert.equal(one.name, 'Insert 1 slot - print 3.stl');
  assert.equal(readStl(one.bytes)[0].closed, true);
});
