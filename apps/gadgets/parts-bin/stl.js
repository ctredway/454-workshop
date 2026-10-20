// STL files: one part each, as every slicer and 3D program reads them. Binary STL: an 80-byte header, the number
// of triangles, then each triangle's normal and three corners (millimetres; STL has no units, and slicers take mm).
//
// stl(mesh, name): a Manifold mesh ({ vertProperties, numProp, triVerts }) as a binary STL's bytes.
// stlFiles(parts): one STL per different part, named with how many to print: [[fileName, bytes]].
import { zip } from './threemf.js';

export function stl(mesh, name) {
  const v = mesh.vertProperties, n = mesh.numProp, t = mesh.triVerts, count = t.length / 3;
  const buf = new ArrayBuffer(84 + 50 * count), dv = new DataView(buf);
  const head = new TextEncoder().encode('454 Workshop: ' + (name || 'part')).subarray(0, 80);   // not "solid…", which marks a text STL
  new Uint8Array(buf, 0, 80).set(head);
  dv.setUint32(80, count, true);
  let o = 84;
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k] * n, b = t[k + 1] * n, c = t[k + 2] * n;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const f of [nx, ny, nz, v[a], v[a + 1], v[a + 2], v[b], v[b + 1], v[b + 2], v[c], v[c + 1], v[c + 2]]) { dv.setFloat32(o, f, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

// parts: [{ name, kind, mesh }], kind the same for parts that are the same shape (one file each kind)
export function stlFiles(parts) {
  const kinds = new Map();
  for (const p of parts) { const k = kinds.get(p.kind); if (k) k.count++; else kinds.set(p.kind, { name: p.kind, mesh: p.mesh, count: 1 }); }
  return [...kinds.values()].map((k) => [k.name + ' - print ' + k.count + '.stl', stl(k.mesh, k.name)]);
}
// what to download: the one STL itself, or a zip of them
export function stlDownload(parts, zipName) {
  const files = stlFiles(parts);
  if (files.length === 1) return { name: files[0][0], bytes: files[0][1], type: 'model/stl' };
  return { name: zipName, bytes: zip(files), type: 'application/zip' };
}
