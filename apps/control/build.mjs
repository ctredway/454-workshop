#!/usr/bin/env node
// Assembles 454 Control's index.html from its source files in apps/control/src.
//
// The page (src/control.html) is Control's HTML with an "@@include <file>" line wherever a file's
// contents go: the styles, and the code split by subject (src/js). Each include is replaced by the file
// exactly as it is, so the result is the same single, self-contained page Control has always been: the
// website and the desktop app use it unchanged.
//
//   node apps/control/build.mjs                write index.html at the top of the repository
//   node apps/control/build.mjs --out <file>   write it somewhere else
//   node apps/control/build.mjs --check        check index.html matches its sources (CI runs this)
//   node apps/control/build.mjs --bare         leave out the "generated" note (to compare with a copy
//                                              made before the split)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'src');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] || true) : null; };
const out = path.resolve(typeof opt('--out') === 'string' ? opt('--out') : path.join(here, '..', '..', 'index.html'));

// Read a text file with \n line endings, whatever the computer: Git on Windows can check files out with
// \r\n, and the page and its files are assembled and compared line by line.
const readText = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

export function assemble({ bare = false } = {}) {
  const page = readText(path.join(src, 'control.html'));
  const used = new Set();
  const repo = path.resolve(here, '..', '..');
  let html = page.replace(/^@@include (\S+)\n/gm, (_, file) => {
    // a file in src/, or elsewhere in the repository (the shared parser, in packages/gcode)
    const f = path.resolve(src, file);
    if (!f.startsWith(repo + path.sep)) throw new Error('control build: ' + file + ' is outside the repository');
    if (!fs.existsSync(f)) throw new Error('control build: ' + file + ' is included by control.html but doesn\u2019t exist');
    if (used.has(file)) throw new Error('control build: ' + file + ' is included twice');
    used.add(file);
    return readText(f);
  });
  // every source file must be used: a file that isn't included is code silently left out
  const all = ['styles', 'js'].flatMap((d) => fs.existsSync(path.join(src, d)) ? fs.readdirSync(path.join(src, d)).map((f) => d + '/' + f) : []);
  const unused = all.filter((f) => !used.has(f));
  if (unused.length) throw new Error('control build: not included by control.html: ' + unused.join(', ') +
    '. Include it, or delete it if it\u2019s no longer used (git rm).');
  if (!bare) html = html.replace(/^(<!DOCTYPE html>\n)/i,
    '$1<!-- 454 Control, assembled by apps/control/build.mjs from apps/control/src. Edit those files, not this one, then run: node apps/control/build.mjs -->\n');
  return { html, files: used.size };
}

if (import.meta.url === 'file://' + process.argv[1] || fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let built;
  try { built = assemble({ bare: !!opt('--bare') }); }
  catch (e) { console.error(e.message); process.exit(1); }       // its own explanation, not a stack trace
  const { html, files } = built;
  if (opt('--check')) {
    const have = fs.existsSync(out) ? readText(out) : '';
    if (have !== html) {
      console.error('index.html doesn\u2019t match apps/control/src. Run: node apps/control/build.mjs, and commit the result.');
      process.exit(1);
    }
    console.log('index.html matches its ' + files + ' source files');
  } else {
    fs.writeFileSync(out, html);
    console.log('454 Control assembled from ' + files + ' files: ' + path.relative(process.cwd(), out) + ' (' + Math.round(html.length / 1024) + ' KB)');
  }
}
