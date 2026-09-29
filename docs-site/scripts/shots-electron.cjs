// Runs inside Electron (started by scripts/shots.mjs): serves the desktop app's bundled pages, opens
// each shot's app in a fresh browser session, runs its setup, and saves the capture as a PNG at twice
// the screen resolution, so the docs' images stay sharp on high-resolution screens.
const { app, BrowserWindow, session } = require('electron');
const http = require('http'), fs = require('fs'), path = require('path');
const { PRELUDE, SHOTS } = require('./shots.cjs');

const APP_DIR = path.resolve(__dirname, '..', '..', 'apps', 'desktop', 'app');
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'assets', 'shots');
const ONLY = process.env.SHOTS_ONLY ? process.env.SHOTS_ONLY.split(',') : null;

app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.on('window-all-closed', () => {});        // each shot closes its window; don't quit between them
app.commandLine.appendSwitch('disable-gpu');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(APP_DIR, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(APP_DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function shoot(port, shot, i) {
  const ses = session.fromPartition('shot-' + i + '-' + Date.now());       // fresh storage: no settings from earlier shots
  // The page is laid out at the shot's size, at twice the resolution, by Chromium's device emulation rather
  // than by the window's size: Windows shrinks a window to fit the screen, and at twice the resolution most
  // shots are taller than a 1080-pixel screen (they came out cut short). The window is shown (a hidden one
  // never paints, and the capture waits for it forever); its own size no longer matters.
  const win = new BrowserWindow({ width: shot.size[0], height: shot.size[1], show: true, useContentSize: true,
    webPreferences: { session: ses, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const url = 'http://127.0.0.1:' + port + '/' + shot.page + (shot.page === 'design.html' ? '?cam' : '');
  await win.loadURL(url);
  const cdp = win.webContents.debugger;
  cdp.attach('1.3');
  await cdp.sendCommand('Emulation.setDeviceMetricsOverride', { width: shot.size[0], height: shot.size[1], deviceScaleFactor: 2, mobile: false });
  // ready: the app has drawn its panel (Design) or its tabs (Control)
  await win.webContents.executeJavaScript(`new Promise((ok, fail) => { const t0 = Date.now(); (function poll(){
    if (typeof DOC !== 'undefined' && document.querySelector('#toolPanel .tGroup')) return ok();
    if (typeof MODEL !== 'undefined' && document.getElementById('tabMachine')) return ok();
    if (Date.now() - t0 > 15000) return fail(new Error('the page never became ready'));
    setTimeout(poll, 100); })(); })`);
  // screenshots show no scrollbars
  await win.webContents.insertCSS('*{scrollbar-width:none !important} *::-webkit-scrollbar{display:none !important}');
  // dismiss startup prompts (Control's "Connect to your machine?")
  await win.webContents.executeJavaScript(`(() => { const s = document.getElementById('connSkip'); if (s && s.offsetParent) s.click(); })()`);
  await new Promise((r) => setTimeout(r, 300));
  // run the setup, and bring back its actual error message if it throws (not just "script failed")
  let rect = await win.webContents.executeJavaScript(`(async () => { try { ${PRELUDE}\n ${shot.setup || ''} } catch (e) { return { __error: String(e && e.stack || e).split('\\n').slice(0, 2).join(' | ') }; } })()`);
  if (rect && rect.__error) throw new Error('setup: ' + rect.__error);
  if (shot.capture && shot.capture.selector) {
    const pad = shot.capture.pad || 0;
    rect = await win.webContents.executeJavaScript(`(async () => { const e = document.querySelector(${JSON.stringify(shot.capture.selector)});
      if (!e) return null; e.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 150));   // fully on screen before capturing
      const r = e.getBoundingClientRect(); return { x: r.left - ${pad}, y: r.top - ${pad}, width: r.width + ${2 * pad}, height: r.height + ${2 * pad} }; })()`);
    if (!rect) throw new Error(shot.name + ': nothing matches ' + shot.capture.selector);
  }
  await new Promise((r) => setTimeout(r, 250));
  const clip = rect ? { x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.round(rect.width), height: Math.round(rect.height) } : undefined;
  const shotPng = await cdp.sendCommand('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' });
  const png = Buffer.from(shotPng.data, 'base64');
  fs.writeFileSync(path.join(OUT_DIR, shot.name + '.png'), png);
  const sz = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };     // from the PNG's header
  cdp.detach();
  win.destroy();
  return sz;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const srv = await serve(), port = srv.address().port;
  let failed = 0;
  for (let i = 0; i < SHOTS.length; i++) {
    const shot = SHOTS[i];
    if (ONLY && !ONLY.includes(shot.name)) continue;
    try { const sz = await shoot(port, shot, i); console.log('  ' + shot.name.padEnd(28) + sz.width + ' x ' + sz.height); }
    catch (e) { failed++; console.error('  ' + shot.name.padEnd(28) + 'FAILED: ' + e.message); }
  }
  srv.close();
  app.exit(failed ? 1 : 0);
});
