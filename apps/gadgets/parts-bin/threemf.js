// A 3MF file: what 3D printers' slicers (Bambu Studio, PrusaSlicer, Orca, Cura) open. It's a zip holding three
// small files; the parts are in 3D/3dmodel.model, each its own object, laid out on the build plate. 3MF Core
// Specification 1.3; millimetres. The zip is stored, not compressed, which every zip reader takes.
//
// parts: [{ name, mesh: { vertProperties, numProp, triVerts }, x, y }]: a Manifold mesh, and where it goes on the
// plate. Returns the file's bytes (a Uint8Array).

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => { const r = Math.round(v * 1e4) / 1e4; return Object.is(r, -0) ? '0' : String(r); };

export function modelXml(parts, title) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    '<metadata name="Title">' + esc(title || '454 Workshop parts bin') + '</metadata>',
    '<metadata name="Application">454 Workshop gadgets</metadata>',
    '<resources>'];
  parts.forEach((p, i) => {
    const { vertProperties: v, numProp: n, triVerts: t } = p.mesh;
    out.push('<object id="' + (i + 1) + '" type="model" name="' + esc(p.name) + '"><mesh><vertices>');
    for (let k = 0; k < v.length; k += n) out.push('<vertex x="' + num(v[k]) + '" y="' + num(v[k + 1]) + '" z="' + num(v[k + 2]) + '"/>');
    out.push('</vertices><triangles>');
    for (let k = 0; k < t.length; k += 3) out.push('<triangle v1="' + t[k] + '" v2="' + t[k + 1] + '" v3="' + t[k + 2] + '"/>');
    out.push('</triangles></mesh></object>');
  });
  out.push('</resources><build>');
  parts.forEach((p, i) => out.push('<item objectid="' + (i + 1) + '" transform="1 0 0 0 1 0 0 0 1 ' + num(p.x || 0) + ' ' + num(p.y || 0) + ' 0"/>'));
  out.push('</build></model>');
  return out.join('\n');
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';

export function make3mf(parts, title) {
  return zip([['[Content_Types].xml', CONTENT_TYPES], ['_rels/.rels', RELS], ['3D/3dmodel.model', modelXml(parts, title)]]);
}

// ---- a stored (uncompressed) zip ----
let CRC;
function crc32(b) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let at = 0;
  for (const [name, text] of files) {
    const nm = enc.encode(name), data = typeof text === 'string' ? enc.encode(text) : text, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);   // UTF-8 names
    h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);            // stored; 1980-01-01
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nm.length, true); c.setUint32(42, at, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    central.push(new Uint8Array(c.buffer), nm);
    at += 30 + nm.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, size, true); e.setUint32(16, at, true);
  const all = parts.concat(central, [new Uint8Array(e.buffer)]);
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let o = 0; for (const b of all) { out.set(b, o); o += b.length; }
  return out;
}
