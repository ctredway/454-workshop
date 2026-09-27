// Builds the pages the desktop app shows, from pinned copies of 454 Control (control/) and 454 Design
// (design/), which stay the source of truth. Each page runs unchanged except:
//  - a Content Security Policy: only the app's own files run
//  - everything it would fetch from the internet comes bundled, so the app works offline
//  - Control loads the Web Serial stand-in first, so its serial calls go to the machine process
// Every substitution is checked: if a page changes an address, the build stops instead of quietly
// shipping something that needs the internet.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'app');
const mod = (p) => require.resolve(p, { paths: [root] });
// Where the pages come from: inside the 454-workshop repository (apps/desktop there), the repository's
// own index.html, design.html and docs/, so there is one copy of each app; otherwise the pinned copies
// in control/ and design/ here. CAM goes in only if its files (cam.js, geom.js) sit beside design.html:
// the public repository leaves them out until CAM is released, and builds made from it have no CAM.
const repo = path.join(root, '..', '..');
const inRepo = fs.existsSync(path.join(repo, 'design.html')) && fs.existsSync(path.join(repo, 'index.html')) &&
               fs.readFileSync(path.join(repo, 'index.html'), 'utf8').includes('CONTROL_VERSION');
const SRC = inRepo
  ? { control: path.join(repo, 'index.html'), design: path.join(repo, 'design.html'), designDir: repo, docs: path.join(repo, 'docs'), from: 'the repository' }
  : { control: path.join(root, 'control', 'index.html'), design: path.join(root, 'design', 'design.html'), designDir: path.join(root, 'design'), docs: path.join(root, 'control', 'docs'), from: 'the pinned copies' };
const CAM = ['cam.js', 'geom.js'].every((f) => fs.existsSync(path.join(SRC.designDir, f)));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });

function csp(extraScript) {
  return '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'' + (extraScript || '') + '; ' +
    'style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src \'self\' https://fonts.gstatic.com data:; ' +
    'img-src \'self\' data: blob:; connect-src \'self\' data: blob:; object-src \'none\'; base-uri \'none\'">';
}
function swap(html, find, replace, what) {
  if (typeof find === 'string' ? !html.includes(find) : !find.test(html)) throw new Error('build-app: ' + what + ' not found; the page changed, so update the bundling here');
  return html.replace(find, replace);
}
function copy(from, to) { fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true }); fs.copyFileSync(from, path.join(out, to)); }

// ---- 454 Control
let control = fs.readFileSync(SRC.control, 'utf8');
control = swap(control, /<head>/i, '<head>\n' + csp() + '\n<script src="desktop-serial.js"></script>', 'Control\'s <head>');
control = swap(control, /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js"><\/script>/,
  '<script src="vendor/three.min.js"></script>', 'Control\'s three.js r128');
fs.writeFileSync(path.join(out, 'index.html'), control);
copy(path.join(root, 'src', 'renderer', 'desktop-serial.js'), 'desktop-serial.js');
copy(mod('three/build/three.min.js'), 'vendor/three.min.js');

// ---- 454 Design (with its CAM engine; sql.js needs WebAssembly)
let design = fs.readFileSync(SRC.design, 'utf8');
design = swap(design, /<head>/i, '<head>\n' + csp(' \'wasm-unsafe-eval\''), 'Design\'s <head>');
design = swap(design, '<script src="https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js"></script>', '<script src="vendor/opentype.min.js"></script>', 'Design\'s opentype.js 1.3.4');
design = swap(design, "var SQLJS_BASE = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.2/dist/';", "var SQLJS_BASE = 'vendor/sql.js/';", 'Design\'s sql.js 1.14.2');
design = swap(design, "var FONT_CDN = 'https://cdn.jsdelivr.net/npm/@fontsource/';", "var FONT_CDN = 'vendor/fontsource/';", 'Design\'s font address');
fs.writeFileSync(path.join(out, 'design.html'), design);
if (CAM) for (const f of ['cam.js', 'geom.js']) copy(path.join(SRC.designDir, f), f);
copy(mod('opentype.js/dist/opentype.min.js'), 'vendor/opentype.min.js');
for (const f of ['sql-wasm.js', 'sql-wasm.wasm']) copy(mod('sql.js/dist/' + f), 'vendor/sql.js/' + f);
// the Text tool's fonts: exactly the ones Design lists, at the versions it names
const fontList = design.slice(design.indexOf('var FONTS = {'), design.indexOf('};', design.indexOf('var FONTS = {')));
const fonts = [...fontList.matchAll(/pkg:'([^']+)',\s*file:'([^']+)'/g)].map((m) => ({ pkg: m[1], file: m[2] }));
if (fonts.length < 1) throw new Error('build-app: Design\'s font list not found');
for (const f of fonts) {
  const name = f.pkg.slice(0, f.pkg.lastIndexOf('@')), ver = f.pkg.slice(f.pkg.lastIndexOf('@') + 1);
  const pj = JSON.parse(fs.readFileSync(mod('@fontsource/' + name + '/package.json'), 'utf8'));
  if (pj.version !== ver) throw new Error(`build-app: Design wants @fontsource/${name}@${ver}, installed ${pj.version}`);
  copy(path.join(path.dirname(mod('@fontsource/' + name + '/package.json')), 'files', f.file), `vendor/fontsource/${f.pkg}/files/${f.file}`);
}

// ---- the About window: versions filled in from the pages themselves, so they can't go out of date.
// A missing version stops the build rather than showing a blank.
const pageVersion = (html, name) => { const m = new RegExp("var " + name + " = '([^']+)'").exec(html); if (!m) throw new Error('build-app: ' + name + ' not found'); return 'v' + m[1]; };
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const about = fs.readFileSync(path.join(root, 'src', 'renderer', 'about.html'), 'utf8')
  .replace('__APP__', pkg.version)
  .replace('__DESIGN__', pageVersion(fs.readFileSync(SRC.design, 'utf8'), 'DESIGN_VERSION'))
  .replace('__CONTROL__', pageVersion(fs.readFileSync(SRC.control, 'utf8'), 'CONTROL_VERSION'))
  .replace('__ELECTRON__', JSON.parse(fs.readFileSync(mod('electron/package.json'), 'utf8')).version);
if (/__[A-Z]+__/.test(about)) throw new Error('build-app: the About page has an unfilled version');
fs.writeFileSync(path.join(out, 'about.html'), about);
copy(path.join(root, 'build', 'logo.svg'), 'about-logo.svg');

// ---- the docs, shared by both
if (fs.existsSync(SRC.docs)) fs.cpSync(SRC.docs, path.join(out, 'docs'), { recursive: true,
  filter: (f) => CAM || path.basename(f) !== 'cam-reference.html' });          // no CAM, no CAM reference

// what went in, for the app (whether to open Design with CAM) and for anyone checking a build
fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify({ cam: CAM, from: SRC.from }, null, 1));
console.log(`app/ built from ${SRC.from}: Control, Design (${fonts.length} fonts, ${CAM ? 'with' : 'without'} CAM), docs; nothing loaded from the internet but Google Fonts, which fall back to system fonts`);
