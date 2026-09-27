// Builds 454workshop.com into site-dist/ from this repository: the landing page here, and the web
// versions of 454 Control (index.html), 454 Design (design.html, with its CAM engine cam.js and
// geom.js) and the docs, unchanged except for their links, which follow the site's layout (/control/,
// /design/, /docs/). The apps stay the single source of truth. CAM is released as a beta.
//
// Cloudflare Pages: build command "node site/build.js", output directory "site-dist".
'use strict';
const fs = require('fs'), path = require('path');
const repo = path.join(__dirname, '..'), out = path.join(repo, 'site-dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// every link change must find what it changes, or the build stops rather than publishing a broken link
function swap(text, from, to, what) {
  if (!text.includes(from)) throw new Error(`site build: "${from}" not found in ${what}; the page changed, so update site/build.js`);
  return text.split(from).join(to);
}
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(out, p)), { recursive: true }); fs.writeFileSync(path.join(out, p), s); };

// the landing page and its files
for (const f of ['index.html', '_headers', '_redirects']) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
fs.cpSync(path.join(__dirname, 'images'), path.join(out, 'images'), { recursive: true });

// 454 Control at /control/
let control = read('index.html');
control = swap(control, 'href="design.html"', 'href="../design/"', 'Control');
control = swap(control, 'href="docs/index.html"', 'href="../docs/index.html"', 'Control');
write('control/index.html', control);

// 454 Design at /design/, with its CAM engine
let design = read('design.html');
design = swap(design, 'href="index.html"', 'href="../control/"', 'Design');
design = swap(design, 'href="docs/index.html"', 'href="../docs/index.html"', 'Design');
design = swap(design, 'href="docs/cam-reference.html"', 'href="../docs/cam-reference.html"', 'Design');
write('design/index.html', design);
for (const f of ['cam.js', 'geom.js']) fs.copyFileSync(path.join(repo, f), path.join(out, 'design', f));   // the CAM engine (beta)

// the docs at /docs/
for (const f of fs.readdirSync(path.join(repo, 'docs'))) {
  const src = path.join(repo, 'docs', f);
  if (f === 'images'){ fs.mkdirSync(path.join(out, 'docs', 'images'), { recursive: true });   // just the logo the docs' header uses
    fs.copyFileSync(path.join(src, 'logo.svg'), path.join(out, 'docs', 'images', 'logo.svg')); continue; }
  if (fs.statSync(src).isDirectory()) continue;
  if (!f.endsWith('.html')) { fs.copyFileSync(src, path.join(out, 'docs', f)); continue; }
  let d = fs.readFileSync(src, 'utf8');
  if (d.includes('href="../index.html"')) d = swap(d, 'href="../index.html"', 'href="../control/"', 'docs/' + f);
  if (d.includes('href="../design.html"')) d = swap(d, 'href="../design.html"', 'href="../design/"', 'docs/' + f);
  write('docs/' + f, d);
}

// check: every link on the site that points within it leads somewhere
const missing = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.html')) continue;
    const html = fs.readFileSync(p, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"#?]+)[^"]*"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:|data:|javascript:)/.test(u) || u.startsWith('//')) continue;
      let target = u.startsWith('/') ? path.join(out, u) : path.join(path.dirname(p), u);
      if (u.endsWith('/')) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) missing.push(path.relative(out, p) + ' -> ' + u);
    }
  }
})(out);
if (missing.length) throw new Error('site build: links that lead nowhere:\n  ' + missing.join('\n  '));
console.log('site-dist/ built: landing page, /control/, /design/ (with CAM, beta), /docs/; every internal link checked');
