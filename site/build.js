// Builds 454workshop.com into site-dist/ from this repository: the landing page here, and the web
// versions of 454 Control (index.html), 454 Design (design.html, with its CAM engine cam.js and
// geom.js) and the docs, unchanged except for their links, which follow the site's layout (/control/,
// /design/, /docs/). The apps stay the single source of truth. CAM is released as a beta.
//
// The docs (/docs) are the Starlight site in docs-site/, built here and copied in.
//
// Cloudflare: build command "npm ci --prefix docs-site && node site/build.js", output directory "site-dist".
'use strict';
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const repo = path.join(__dirname, '..'), out = path.join(repo, 'site-dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// The docs site (Astro) needs Node 22.12 or newer: say so plainly, before its build fails deep inside.
function docsNodeOk() {
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj > 22 || (maj === 22 && min >= 12)) return;
  throw new Error('The docs site needs Node.js 22.12 or newer (this is ' + process.versions.node + '). Install Node 22 LTS from nodejs.org' +
    ' (on GitHub, the workflows set node-version: 22).');
}

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

// the docs at /docs/: the Starlight site in docs-site/ (its pages keep the old .html addresses)
const docsSite = path.join(repo, 'docs-site');
if (!fs.existsSync(path.join(docsSite, 'node_modules'))) throw new Error('site build: install the docs site first: npm ci --prefix docs-site');
docsNodeOk();
execSync('npm run build', { cwd: docsSite, stdio: 'inherit' });
fs.cpSync(path.join(docsSite, 'dist'), path.join(out, 'docs'), { recursive: true });

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
      // the docs link to /docs/page without .html (Cloudflare serves page.html), and /docs for its index
      const found = fs.existsSync(target) && fs.statSync(target).isFile() || fs.existsSync(target + '.html') || fs.existsSync(path.join(target, 'index.html'));
      if (!found) missing.push(path.relative(out, p) + ' -> ' + u);
    }
  }
})(out);
if (missing.length) throw new Error('site build: links that lead nowhere:\n  ' + missing.join('\n  '));
console.log('site-dist/ built: landing page, /control/, /design/ (with CAM, beta), /docs/; every internal link checked');
