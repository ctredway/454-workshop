// 454 Design's files in the desktop app (src/design-files.js): opened and saved by path, on real files in a
// scratch folder, with the Open and Save windows answered in advance.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createDesignFiles } = require('../src/design-files.js');

let dir;
const drawing = (w) => JSON.stringify({ stock: { w: 200, h: 120 }, ents: [{ t: 'rect', x: 0, y: 0, w, h: 20 }] });
function files({ open = [], saveAs = null } = {}) {
  const dialog = {
    showOpenDialog: async () => ({ canceled: !open.length, filePaths: open }),
    showSaveDialog: async () => ({ canceled: !saveAs, filePath: saveAs }),
  };
  return createDesignFiles({ fs, path, dialog, listFile: path.join(dir, 'design-files.json') });
}
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p454-files-')); });

describe('saving', () => {
  it('Save as writes where you chose, and Save then goes back to it', async () => {
    const f = files({ saveAs: path.join(dir, 'bench.454.json') });
    const r = await f.saveAs(null, drawing(40), 'design.454.json');
    expect(r).toEqual({ path: path.join(dir, 'bench.454.json'), name: 'bench.454.json' });
    expect(f.save(r.path, drawing(55))).toMatchObject({ ok: true, name: 'bench.454.json' });
    expect(JSON.parse(fs.readFileSync(r.path, 'utf8')).ents[0].w).toBe(55);
    expect(fs.readdirSync(dir).filter((n) => n.endsWith('.saving'))).toEqual([]);   // no half-written file left
  });
  it('a name typed without .json gets .454.json', async () => {
    const r = await files({ saveAs: path.join(dir, 'shelf') }).saveAs(null, drawing(1));
    expect(r.name).toBe('shelf.454.json');
    expect(fs.existsSync(path.join(dir, 'shelf.454.json'))).toBe(true);
  });
  it('Cancel in the Save window saves nothing', async () => {
    expect(await files().saveAs(null, drawing(1))).toBe(null);
    expect(fs.readdirSync(dir).filter((n) => n.endsWith('.json'))).toEqual([]);
  });
  it('a file it saved or opened is still allowed after the app is restarted', async () => {
    const p = path.join(dir, 'kept.454.json');
    await files({ saveAs: p }).saveAs(null, drawing(1));
    fs.writeFileSync(p, '{"not": "a drawing any more"}');                       // (so only the remembered list allows it)
    expect(files().save(p, drawing(2)).ok).toBe(true);                           // a new instance: the list, from disk
  });
});

describe('what it may write', () => {
  it('an existing 454 drawing, even one it hasn’t seen (dropped on the window, say)', () => {
    const p = path.join(dir, 'dropped.454.json'); fs.writeFileSync(p, drawing(3));
    expect(files().save(p, drawing(4)).ok).toBe(true);
  });
  it('never a file that isn’t a drawing, or isn’t .json', () => {
    const f = files();
    const pkg = path.join(dir, 'package.json'); fs.writeFileSync(pkg, '{"name": "something"}');
    expect(f.save(pkg, drawing(1))).toMatchObject({ ok: false });
    expect(fs.readFileSync(pkg, 'utf8')).toBe('{"name": "something"}');         // untouched
    expect(f.save(path.join(dir, 'notes.txt'), 'x').ok).toBe(false);
    expect(f.save(path.join(dir, 'new.json'), drawing(1)).ok).toBe(false);       // not one you picked, and not there
    expect(f.save(path.join(dir, 'autoexec.bat'), 'x').ok).toBe(false);
  });
});

describe('opening', () => {
  it('reads the chosen files, with their paths, and remembers a drawing so Save may go back to it', async () => {
    const p = path.join(dir, 'sign.454.json'); fs.writeFileSync(p, drawing(9));
    const items = await files({ open: [p] }).open(null);
    expect(items.map((i) => i.name)).toEqual(['sign.454.json']);
    expect(items[0].path).toBe(p);
    expect(JSON.parse(Buffer.from(items[0].data).toString('utf8')).ents[0].w).toBe(9);
    fs.writeFileSync(p, 'overwritten by something else');
    expect(files().save(p, drawing(10)).ok).toBe(true);                          // remembered, from the Open window
  });
  it('Cancel in the Open window opens nothing', async () => {
    expect(await files().open(null)).toEqual([]);
  });
});

describe('Open and Import ask for different files', () => {
  async function asked(kind) {
    let opts = null;
    const df = createDesignFiles({ fs, path, dialog: { showOpenDialog: async (_w, o) => { opts = o; return { canceled: true, filePaths: [] }; } }, listFile: path.join(dir, 'list-' + Math.random() + '.json') });
    await df.open(null, kind);
    return opts;
  }
  it('Open: drawings, and VCarve and Carbide Create projects', async () => {
    const o = await asked('open');
    expect(o.title).toBe('Open');
    expect(o.filters[0].extensions).toEqual(['json', 'crv', 'c2d']);
    expect(o.filters[1].extensions).toEqual(['*']);
    expect(await asked(undefined)).toEqual(o);
  });
  it('Import: DXF and SVG drawings, and pictures to trace', async () => {
    const o = await asked('import');
    expect(o.title).toBe('Import');
    expect(o.filters[0].extensions).toEqual(['dxf', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']);
    expect(o.filters[0].extensions).not.toContain('json');
    expect(o.properties).toContain('multiSelections');
  });
});
