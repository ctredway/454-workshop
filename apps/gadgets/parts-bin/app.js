// The parts bin maker's page: the settings, the preview and the download. The shapes are geometry.js's; the file
// threemf.js's; the preview viewer.js's. Manifold (manifold.js and manifold.wasm, copied beside this by the site's
// build) does the solid modelling, in the browser.
import Module from './manifold.js';
import { DEFAULTS, derived, problems, frame, insert, partsFor } from './geometry.js';
import { make3mf } from './threemf.js';
import { stlDownload } from './stl.js';
import { viewer } from './viewer.js';

const $ = (id) => document.getElementById(id);
const NUMS = ['Units', 'TrayL', 'TrayW', 'TrayH', 'Clear', 'Wall', 'Floor', 'InsWall', 'CornerR', 'FloorR', 'NotchR', 'NotchDepth', 'RimH', 'RimW', 'RimTop', 'BaseCh', 'InsCh'];
const SAVE = '454-gadget-parts-bin';
const COLORS = { frame: [0.36, 0.42, 0.5], ins: [[0.0, 0.51, 1.0], [1.0, 0.62, 0.2], [0.35, 0.78, 0.45], [0.85, 0.45, 0.85]] };
const MAX_INSERT = 6;           // insert lengths offered: 1 slot up to this, or the tray's slots if fewer

let M = null, view = null, mode = 'assembled', counts = { 1: 2, 2: 1 }, timer = 0, firstShow = true;

// ---- the settings ----
function read() {
  const p = Object.assign({}, DEFAULTS);
  for (const k of NUMS) { const el = $(k); if (el) p[k] = el.value === '' ? NaN : Number(el.value); }
  const h = $('height').value;
  if (h !== 'custom') p.TrayH = Number(h);
  p.notches = $('notches').checked; p.rim = $('rim').checked;
  const frames = Math.max(0, Math.floor(Number($('frames').value) || 0));
  return { p, frames };
}
function write(p, frames) {
  for (const k of NUMS) if ($(k)) $(k).value = p[k];
  $('height').value = p.TrayH === 6 ? '6' : p.TrayH === 12 ? '12' : 'custom';
  $('customRow').hidden = $('height').value !== 'custom';
  $('notches').checked = p.notches !== false; $('rim').checked = p.rim !== false;
  $('frames').value = frames;
}
const fileType = () => (document.querySelector('input[name=fmt]:checked') || {}).value === 'stl' ? 'stl' : '3mf';
function remember(p, frames) {
  try { localStorage.setItem(SAVE, JSON.stringify({ p, frames, counts, fmt: fileType() })); } catch (e) { /* private window: not kept */ }
}
function recall() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE) || 'null');
    if (s && s.p) { counts = s.counts || counts; write(Object.assign({}, DEFAULTS, s.p), s.frames ?? 1); }
    if (s && s.fmt === 'stl') document.querySelector('input[name=fmt][value=stl]').checked = true;
  } catch (e) { /* nothing kept, or unreadable: the standard sizes */ }
}

// the insert counts, one row per length the tray can take
function insertRows(p) {
  const most = Math.max(1, Math.min(MAX_INSERT, Number.isInteger(p.Units) && p.Units > 0 ? p.Units : 1));
  const box = $('insertRows'), have = box.children.length;
  if (have === most) return;
  box.textContent = '';
  for (let u = 1; u <= most; u++) {
    const row = document.createElement('label'); row.className = 'insRow';
    row.innerHTML = '<span>' + u + (u === 1 ? ' slot long' : ' slots long') + '</span>';
    const inp = document.createElement('input');
    Object.assign(inp, { type: 'number', min: 0, max: 99, step: 1, value: counts[u] || 0, id: 'ins' + u });
    inp.addEventListener('input', () => { counts[u] = Math.max(0, Math.floor(Number(inp.value) || 0)); later(); });
    row.appendChild(inp); box.appendChild(row);
  }
  for (const u of Object.keys(counts)) if (Number(u) > most) delete counts[u];
}
function order(frames) {
  const ins = {};
  for (const [u, n] of Object.entries(counts)) if (n > 0) ins[u] = n;
  return { frames, inserts: ins };
}

// ---- making it ----
function later() { clearTimeout(timer); timer = setTimeout(update, 120); }
function update() {
  const { p, frames } = read();
  $('customRow').hidden = $('height').value !== 'custom';
  insertRows(p);
  const bad = problems(p);
  const used = Object.entries(counts).reduce((s, [u, n]) => s + Number(u) * n, 0), room = frames * p.Units;
  const d = derived(p);
  $('slotSize').textContent = bad.length ? '' : 'Each slot is ' + fmt(d.Pitch) + ' × ' + fmt(d.PocketW) + ' mm inside; a 1-slot insert is ' + fmt(d.insL(1)) + ' × ' + fmt(d.InsW) + ' × ' + fmt(d.InsH) + ' mm.';
  $('fillSays').textContent = !frames ? 'Inserts only, with no tray.'
    : used === room ? 'These fill ' + (frames === 1 ? 'the tray' : 'all ' + frames + ' trays') + ' exactly.'
    : used < room ? 'These fill ' + used + ' of ' + room + ' slots.'
    : 'These need ' + used + ' slots: ' + (used - room) + ' more than the ' + (frames === 1 ? 'tray has' : frames + ' trays have') + '.';
  const pr = $('problems');
  if (bad.length) { pr.hidden = false; pr.innerHTML = '<b>That can’t be made yet:</b><ul>' + bad.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>'; }
  else pr.hidden = true;
  const nothing = !frames && !used;
  $('dlBtn').textContent = 'Download ' + fileType().toUpperCase();
  $('dlBtn').disabled = !!bad.length || nothing || !M;
  $('dlSays').textContent = bad.length ? '' : nothing ? 'Nothing to make: add a tray or an insert.'
    : (frames ? frames + (frames === 1 ? ' tray' : ' trays') : '') + (frames && used ? ' and ' : '') +
      (used ? plural(Object.values(counts).reduce((s, n) => s + n, 0), 'insert') : '') + ', as separate parts.';
  remember(p, frames);
  if (!bad.length && M) show(p, frames);
}
function show(p, frames) {
  if (!view) return;
  $('busy').hidden = false;
  requestAnimationFrame(() => setTimeout(() => {
    const parts = [], d = derived(p);
    const ins = (u, k) => ({ color: COLORS.ins[(u - 1) % COLORS.ins.length] });
    if (mode === 'plate') {
      for (const it of partsFor(M, p, order(frames)))
        parts.push({ mesh: it.solid.getMesh(), color: it.units ? ins(it.units).color : COLORS.frame, at: [it.x, it.y, 0] });
    } else {
      // in the tray: the inserts in order, as many as fit; Stacked: a second tray on the first, inserts in both
      const fr = frame(M, p).getMesh(), levels = mode === 'stacked' ? 2 : 1;
      const list = Object.keys(counts).map(Number).sort((a, b) => b - a).flatMap((u) => Array(counts[u] || 0).fill(u));
      const meshes = {};
      for (let lv = 0; lv < levels; lv++) {
        const z = lv * p.TrayH;
        parts.push({ mesh: fr, color: COLORS.frame, at: [0, 0, z] });
        let at = -d.PocketL / 2;
        for (const u of list) {
          if (at + u * d.Pitch > d.PocketL / 2 + 1e-6) continue;
          meshes[u] = meshes[u] || insert(M, p, u).getMesh();
          parts.push({ mesh: meshes[u], color: ins(u).color, at: [at + u * d.Pitch / 2, 0, z + p.Floor] });
          at += u * d.Pitch;
        }
      }
    }
    view.show(parts, { keepView: !firstShow });
    firstShow = false;
    $('busy').hidden = true;
  }, 0));
}
function download() {
  const { p, frames } = read();
  if (problems(p).length) return;
  $('dlBtn').disabled = true; $('busy').hidden = false;
  setTimeout(() => {
    try {
      const parts = partsFor(M, p, order(frames), { seg: 24, filletSteps: 16 });
      const base = 'parts-bin-' + p.Units + '-slot-' + fmt(p.TrayL) + 'x' + fmt(p.TrayW) + 'x' + fmt(p.TrayH);
      let file;
      if (fileType() === 'stl') file = stlDownload(parts.map((x) => ({ name: x.name, kind: x.kind, mesh: x.solid.getMesh() })), base + '-stl.zip');
      else file = { name: base + '.3mf', type: 'model/3mf',
        bytes: make3mf(parts.map((x) => ({ name: x.name, mesh: x.solid.getMesh(), x: x.x, y: x.y })), 'Parts bin ' + fmt(p.TrayL) + ' x ' + fmt(p.TrayW) + ' mm') };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([file.bytes], { type: file.type }));
      a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    } catch (e) {
      $('dlSays').textContent = 'The file couldn’t be made: ' + (e && e.message || e) + '. Try other sizes, or report it.';
    }
    $('dlBtn').disabled = false; $('busy').hidden = true;
  }, 30);
}
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const fmt = (v) => String(Math.round(v * 100) / 100);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---- the page ----
recall();
for (const el of $('form').querySelectorAll('input, select')) el.addEventListener('input', later);
for (const el of document.querySelectorAll('input[name=fmt]')) el.addEventListener('change', () => {
  const { p, frames } = read();
  $('dlBtn').textContent = 'Download ' + fileType().toUpperCase(); remember(p, frames);
});
$('height').addEventListener('change', () => { if ($('height').value === 'custom') $('TrayH').focus(); later(); });
$('fillBtn').addEventListener('click', () => {
  const { p, frames } = read();
  counts = { 1: Math.max(1, frames) * (Number.isInteger(p.Units) ? p.Units : 1) };
  $('insertRows').textContent = ''; update();
});
$('resetBtn').addEventListener('click', () => { const { frames } = read(); write(DEFAULTS, frames); $('insertRows').textContent = ''; update(); });
for (const b of document.querySelectorAll('.seg[data-view]')) b.addEventListener('click', () => {
  mode = b.dataset.view;
  for (const o of document.querySelectorAll('.seg[data-view]')) { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)); }
  firstShow = true; update();
});
$('resetView').addEventListener('click', () => view && view.reset());
$('dlBtn').addEventListener('click', download);

view = viewer($('cv'));
if (!view) $('noGl').hidden = false;
$('busy').hidden = false;
update();
Module().then((m) => { m.setup(); M = m; update(); })
  .catch((e) => { $('busy').hidden = true; $('problems').hidden = false; $('problems').textContent = 'The modelling part of this page didn’t load (' + (e && e.message || e) + '). Reload the page to try again.'; });
