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

// what search engines are told about the two apps' pages on the website (the apps themselves aren't changed)
const SITE = 'https://454workshop.com';
function forSearch(html, title, page, desc, what) {
  return swap(html, '<title>' + title + '</title>', '<title>' + title + '</title>\n<meta name="description" content="' + desc + '">\n' +
    '<link rel="canonical" href="' + SITE + page + '">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="454 Workshop">\n' +
    '<meta property="og:title" content="' + title + '">\n<meta property="og:description" content="' + desc + '">\n<meta property="og:url" content="' + SITE + page + '">\n' +
    '<meta property="og:image" content="' + SITE + '/images/og.png">\n<meta name="twitter:card" content="summary_large_image">', what);
}

// the landing page and its files
for (const f of ['index.html', '_headers', '_redirects']) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
fs.cpSync(path.join(__dirname, 'images'), path.join(out, 'images'), { recursive: true });

// 454 Control at /control/
let control = read('index.html');
control = swap(control, 'href="design.html"', 'href="../design/"', 'Control');
control = swap(control, 'href="docs/index.html"', 'href="../docs/index.html"', 'Control');
control = forSearch(control, '454 Control · G-code sender', '/control/',
  'A free G-code sender for GRBL CNC routers like the Shapeoko, in your browser: home, jog, probe with a BitZero and BitSetter, check the job and run it.', 'Control');
write('control/index.html', control);

// 454 Design at /design/, with its CAM engine
let design = read('design.html');
design = swap(design, 'href="index.html"', 'href="../control/"', 'Design');
design = swap(design, 'href="docs/index.html"', 'href="../docs/index.html"', 'Design');
design = swap(design, 'href="docs/cam-reference.html"', 'href="../docs/cam-reference.html"', 'Design');
design = forSearch(design, '454 Design · precision 2D sketcher', '/design/',
  'Free CAD/CAM for CNC routers, in your browser: draw parts, open VCarve, Carbide Create, DXF and SVG files, make toolpaths, preview the cut in 3D and save G-code.', 'Design');
write('design/index.html', design);
for (const f of ['cam.js', 'geom.js']) fs.copyFileSync(path.join(repo, f), path.join(out, 'design', f));   // the CAM engine (beta)

// the docs at /docs/: the Starlight site in docs-site/ (its pages keep the old .html addresses)
const docsSite = path.join(repo, 'docs-site');
if (!fs.existsSync(path.join(docsSite, 'node_modules'))) throw new Error('site build: install the docs site first: npm ci --prefix docs-site');
docsNodeOk();
execSync('npm run build', { cwd: docsSite, stdio: 'inherit' });
fs.cpSync(path.join(docsSite, 'dist'), path.join(out, 'docs'), { recursive: true });

// The docs' pages name their own address (the canonical link, and the one for sharing) with .html, but the
// website sends those on to the address without it. Name the one that's served, so search engines aren't told two.
let docsPages = 0;
for (const f of fs.readdirSync(path.join(out, 'docs'))) {
  if (!f.endsWith('.html')) continue;
  const p = path.join(out, 'docs', f), was = SITE + '/docs/' + f, now = SITE + '/docs/' + (f === 'index.html' ? '' : f.slice(0, -5));
  let html = fs.readFileSync(p, 'utf8');
  if (f !== '404.html') html = swap(html, '<link rel="canonical" href="' + was + '"/>', '<link rel="canonical" href="' + now + '"/>', 'docs/' + f);
  html = html.split('<meta property="og:url" content="' + was + '"/>').join('<meta property="og:url" content="' + now + '"/>');
  fs.writeFileSync(p, html); docsPages++;
}

// robots.txt and the sitemap: every page a search engine should know, the docs' own list included
const docsMaps = fs.readdirSync(path.join(out, 'docs')).filter((f) => /^sitemap-\d+\.xml$/.test(f)).sort();
if (!docsMaps.length) throw new Error('site build: the docs made no sitemap (docs/sitemap-0.xml)');
const today = new Date().toISOString().slice(0, 10);
const pages = ['/', '/design/', '/control/'];
write('sitemap-pages.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  pages.map((u) => '  <url><loc>' + SITE + u + '</loc><lastmod>' + today + '</lastmod></url>\n').join('') + '</urlset>\n');
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  ['sitemap-pages.xml'].concat(docsMaps.map((f) => 'docs/' + f)).map((f) => '  <sitemap><loc>' + SITE + '/' + f + '</loc></sitemap>\n').join('') + '</sitemapindex>\n');
write('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');
// check: every address in the sitemaps is a page that's served
const listed = pages.slice();
for (const f of docsMaps) for (const m of fs.readFileSync(path.join(out, 'docs', f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) listed.push(m[1].replace(SITE, ''));
const unserved = listed.filter((u) => { const t = path.join(out, u); return !(fs.existsSync(path.join(t, 'index.html')) || fs.existsSync(t + '.html')); });
if (unserved.length) throw new Error('site build: the sitemap lists pages that aren\u2019t there:\n  ' + unserved.join('\n  '));

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
console.log('site-dist/ built: landing page, /control/, /design/ (with CAM, beta), /docs/ (' + docsPages + ' pages); ' + listed.length + ' pages in the sitemap; every internal link checked');
