// Serves the built website (site-dist/, from node site/build.js) on this computer, to try it before it goes live:
//   node site/build.js && node site/serve.js       then open http://localhost:8454/
// Pages that load scripts or 3D files (the gadgets) can't be opened as files: they need a server, as the real
// site is. Only this computer can reach it. Ctrl+C stops it.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'site-dist'), port = Number(process.env.PORT) || 8454;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff2': 'font/woff2' };
if (!fs.existsSync(root)) { console.error('Build the site first: node site/build.js'); process.exit(1); }
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  // as Cloudflare does: /folder/ is its index.html, and /docs/page is page.html
  let f = path.join(root, p.endsWith('/') ? p + 'index.html' : p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
  if (!fs.existsSync(f)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found: ' + p); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('The website is at http://localhost:' + port + '/  (the parts bin: http://localhost:' + port + '/gadgets/parts-bin/). Ctrl+C stops it.'));
