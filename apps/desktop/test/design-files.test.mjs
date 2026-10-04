// 454 Design's files in the desktop app (src/design-files.js): opened and saved by path, on real files in a
// scratch folder, with the Open and Save windows answered in advance.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createDesignFiles, RECENT_MAX } = require('../src/design-files.js');

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

// ---- File > Open recent: the last projects opened or saved, newest first ----
describe('recent files', () => {
  function withRecent({ open = [], saveAs = null } = {}) {
    const changes = [];
    const dialog = { showOpenDialog: async () => ({ canceled: !open.length, filePaths: open }), showSaveDialog: async () => ({ canceled: !saveAs, filePath: saveAs }) };
    const f = createDesignFiles({ fs, path, dialog, listFile: path.join(dir, 'design-files.json'), recentFile: path.join(dir, 'design-recent.json'), onRecent: () => changes.push(1) });
    return { f, changes, names: () => f.recent().map((r) => r.name) };
  }
  const make = (name, text = drawing(10)) => { const p = path.join(dir, name); fs.writeFileSync(p, text); return p; };

  it('a project opened, saved or saved as goes to the top; each is listed once, with its folder', async () => {
    const a = make('a.454.json'), b = make('b.crv', 'vcarve'), c = make('c.c2d', 'carbide');
    let r = withRecent({ open: [a] }); await r.f.open(null, 'open');
    expect(r.names()).toEqual(['a.454.json']);
    expect(r.f.recent()[0]).toEqual({ path: a, name: 'a.454.json', dir });
    expect(r.changes.length).toBe(1);                                            // the menu is told
    r = withRecent({ open: [b] }); await r.f.open(null, 'open');
    r = withRecent({ open: [c] }); await r.f.open(null);
    expect(r.names()).toEqual(['c.c2d', 'b.crv', 'a.454.json']);
    expect(r.f.save(a, drawing(20)).ok).toBe(true);                              // Save: back to the top
    expect(r.names()).toEqual(['a.454.json', 'c.c2d', 'b.crv']);
    r = withRecent({ saveAs: path.join(dir, 'new.454.json') }); await r.f.saveAs(null, drawing(1));
    expect(r.names()).toEqual(['new.454.json', 'a.454.json', 'c.c2d', 'b.crv']);
  });
  it('one file is one entry, whatever the letter case it was named with', async () => {
    const a = make('Bench.454.json');
    const r = withRecent({ open: [a] }); await r.f.open(null, 'open');
    r.f.save(a.toUpperCase(), drawing(2));
    expect(r.f.recent().length).toBe(1);
  });
  it('several picked at once: the first picked is on top', async () => {
    const r = withRecent({ open: [make('one.454.json'), make('two.454.json')] }); await r.f.open(null, 'open');
    expect(r.names()).toEqual(['one.454.json', 'two.454.json']);
  });
  it('what Import brings in isn’t a recent file', async () => {
    const r = withRecent({ open: [make('logo.svg', '<svg/>'), make('part.dxf', '0')] }); await r.f.open(null, 'import');
    expect(r.names()).toEqual([]);
    expect(r.f.noteRecent(path.join(dir, 'logo.svg'))).toBe(false);
  });
  it('keeps the last ' + RECENT_MAX + ', and they’re still there after the app is restarted', async () => {
    const all = []; for (let i = 1; i <= RECENT_MAX + 3; i++) all.push(make('p' + i + '.454.json'));
    const one = withRecent({ open: all.slice(0, 2) }); await one.f.open(null, 'open');
    for (const p of all.slice(2)) one.f.save(p, drawing(3));                     // all in one sitting
    expect(one.names().length).toBe(RECENT_MAX);
    const again = withRecent();
    expect(again.names().length).toBe(RECENT_MAX);
    expect(again.names()[0]).toBe('p' + (RECENT_MAX + 3) + '.454.json');
    expect(again.names()).not.toContain('p3.454.json');
  });
  it('opening one again reads it, moves it to the top, and Save may then write it', async () => {
    const a = make('a.454.json', drawing(40)), b = make('b.454.json');
    let r = withRecent({ open: [a] }); await r.f.open(null, 'open');
    r = withRecent({ open: [b] }); await r.f.open(null, 'open');
    fs.rmSync(path.join(dir, 'design-files.json'));                               // as if only the recent list knew it
    r = withRecent();
    const got = r.f.openRecent(a);
    expect(got.path).toBe(a); expect(got.name).toBe('a.454.json');
    expect(JSON.parse(Buffer.from(got.data).toString()).ents[0].w).toBe(40);
    expect(r.names()).toEqual(['a.454.json', 'b.454.json']);
    fs.writeFileSync(a, 'overwritten by something else');
    expect(r.f.save(a, drawing(41)).ok).toBe(true);
  });
  it('only a file on the list can be opened that way', async () => {
    const secret = make('secret.454.json'), r = withRecent();
    expect(r.f.openRecent(secret)).toBe(null);
    expect(r.f.openRecent(path.join(dir, 'design-files.json'))).toBe(null);
    expect(r.f.openRecent(undefined)).toBe(null);
  });
  it('one that’s been moved or deleted says so, and comes off the list', async () => {
    const a = make('a.454.json'), b = make('b.454.json');
    let r = withRecent({ open: [a, b] }); await r.f.open(null, 'open');
    fs.rmSync(a);
    expect(r.f.openRecent(a)).toEqual({ missing: true, name: 'a.454.json' });
    expect(r.names()).toEqual(['b.454.json']);
    expect(withRecent().names()).toEqual(['b.454.json']);                         // and stays off
  });
  it('a project dropped on the window is listed, if it’s there; Clear empties the list', async () => {
    const a = make('dropped.crv', 'x'), r = withRecent();
    expect(r.f.noteRecent(a)).toBe(true);
    expect(r.f.noteRecent(path.join(dir, 'not-there.454.json'))).toBe(false);
    expect(r.names()).toEqual(['dropped.crv']);
    r.f.clearRecent();
    expect(r.names()).toEqual([]);
    expect(withRecent().names()).toEqual([]);
  });
  it('a list file that’s been spoiled is taken as empty', () => {
    fs.writeFileSync(path.join(dir, 'design-recent.json'), '{"not": "a list"}');
    expect(withRecent().names()).toEqual([]);
    fs.writeFileSync(path.join(dir, 'design-recent.json'), JSON.stringify([5, 'C:/x/readme.txt', null]));
    expect(withRecent().names()).toEqual([]);
  });
});
