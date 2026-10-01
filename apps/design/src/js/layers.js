/* ============================================================
   LAYERS
   Every shape and reference image belongs to a layer. Hidden layers aren't drawn, picked or
   snapped to; locked ones are drawn but can't be picked or changed. New shapes go on the active
   layer. Hiding is for seeing only: toolpaths still cut shapes on hidden layers, as in VCarve.
   Images keep their pixels in DOC.imageData (by id) so undo snapshots stay small.
   ============================================================ */
var LAYER_ICONS = {
  eye: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  eyeOff: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z"/><path d="M2.5 13.5l11-11"/></svg>',
  lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>',
  unlock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 014.8-1"/></svg>',
  move: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M9 4.5L12.5 8 9 11.5"/></svg>',
  del: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.4 4.5l.7 8.5h5.8l.7-8.5"/></svg>',
  img: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2.5 11.5l3.5-3.5 3 3 2-2 2.5 2.5"/><circle cx="10.5" cy="6" r="1"/></svg>'
};
function layerById(id){ return (DOC.layers || []).filter(function (l) { return l.id === id; })[0] || null; }
function layersInit(){
  sheetsInit();                                        // sheets first: older drawings kept them as layers
  if (!DOC.layers || !DOC.layers.length) DOC.layers = [{id: 'L1', name: 'Layer 1', visible: true, locked: false}];
  if (!layerById(DOC.activeLayer)) DOC.activeLayer = DOC.layers[0].id;
  DOC.images = DOC.images || []; DOC.imageData = DOC.imageData || {};
  if (DOC.bgImage){                                    // a reference image from 0.76.0 becomes a layer
    var lid = layerNew('Reference image', true);      // at the bottom, underneath the shapes
    DOC.imageData[lid] = DOC.bgImage.src;
    DOC.images.push({id: lid, layer: lid, x: DOC.bgImage.x, y: DOC.bgImage.y, w: DOC.bgImage.w, h: DOC.bgImage.h});
    delete DOC.bgImage;
  }
  DOC.ents.forEach(function (e) { if (!layerById(e.layer)) e.layer = DOC.activeLayer; });   // new shapes, old drawings
}
function layerNew(name, atBottom){
  var n = 1; while (layerById('L' + n)) n++;
  // names count the ordinary layers ("Layer 2" when there's one already), not internal ids
  var used = {}; DOC.layers.forEach(function (l) { var m = /^Layer (\d+)$/.exec(l.name); if (m) used[+m[1]] = true; });
  var k = 1; while (used[k]) k++;
  var L = {id: 'L' + n, name: name || ('Layer ' + k), visible: true, locked: false};
  if (atBottom) DOC.layers.unshift(L); else DOC.layers.push(L);   // the bottom is drawn underneath
  return L.id;
}
function entVisible(e){ var L = layerById(e.layer); return (!L || L.visible) && entOnSheet(e); }
function entEditable(e){ var L = layerById(e.layer); return (!L || (L.visible && !L.locked)) && entOnSheet(e); }
function layerCount(id){ return DOC.ents.filter(function (e) { return e.layer === id; }).length; }
function layerImages(id){ return DOC.images.filter(function (im) { return im.layer === id; }); }
function renderLayers(){
  var box = document.getElementById('layerList');
  if (!box || !DOC) return;
  layersInit();
  box.innerHTML = '';
  var selLayers = {};
  SEL.forEach(function (i) { var e = DOC.ents[i]; if (e) selLayers[e.layer] = true; });
  DOC.layers.slice().reverse().forEach(function (L) {                // top of the list = drawn on top
    var row = document.createElement('div');
    row.className = 'layerRow' + (L.id === DOC.activeLayer ? ' active' : '') + (L.visible ? '' : ' hiddenL');
    row.setAttribute('role', 'listitem');
    row.title = L.id === DOC.activeLayer ? 'The active layer: new shapes go here' : 'Click to make this the active layer';
    function iconBtn(icon, cls, title, label, fn){
      var b = document.createElement('button'); b.className = cls || ''; b.innerHTML = LAYER_ICONS[icon]; b.title = title; b.setAttribute('aria-label', label);
      b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
      return b;
    }
    row.appendChild(iconBtn(L.visible ? 'eye' : 'eyeOff', L.visible ? '' : 'off', L.visible ? 'Shown \u2014 click to hide' : 'Hidden \u2014 click to show',
      (L.visible ? 'Hide ' : 'Show ') + L.name, function () { layerToggle(L.id, 'visible'); }));
    row.appendChild(iconBtn(L.locked ? 'lock' : 'unlock', L.locked ? '' : 'off', L.locked ? 'Locked: can\u2019t be selected or changed \u2014 click to unlock' : 'Unlocked \u2014 click to lock',
      (L.locked ? 'Unlock ' : 'Lock ') + L.name, function () { layerToggle(L.id, 'locked'); }));
    var imgs = layerImages(L.id);
    if (imgs.length){ var ic = document.createElement('span'); ic.innerHTML = LAYER_ICONS.img; ic.style.cssText = 'line-height:0;color:var(--muted)'; ic.title = 'Holds a reference image'; row.appendChild(ic); }
    var nm = document.createElement('span'); nm.className = 'lName'; nm.textContent = L.name;
    nm.title = 'Double-click to rename';
    nm.addEventListener('dblclick', function (ev) { ev.stopPropagation(); layerRename(L.id, nm); });
    row.appendChild(nm);
    var cnt = layerCount(L.id), ct = document.createElement('span'); ct.className = 'lCount'; ct.textContent = cnt ? String(cnt) : (imgs.length ? '' : '0');
    ct.title = cnt + (cnt === 1 ? ' shape' : ' shapes'); row.appendChild(ct);
    var others = Object.keys(selLayers).some(function (k) { return k !== L.id; });
    if (SEL.length && others && !L.locked)
      row.appendChild(iconBtn('move', '', 'Move the selected shapes to this layer', 'Move selected shapes to ' + L.name, function () { layerMoveSelection(L.id); }));
    var del = iconBtn('del', 'lDel', DOC.layers.length > 1 ? 'Delete this layer' : 'The only layer can\u2019t be deleted', 'Delete ' + L.name, function () { layerDelete(L.id); });
    del.disabled = DOC.layers.length < 2; row.appendChild(del);
    row.addEventListener('click', function () { DOC.activeLayer = L.id; persist(); renderLayers(); });
    box.appendChild(row);
  });
}
function layerToggle(id, what){
  var L = layerById(id); if (!L) return;
  pushUndo();
  L[what] = !L[what];
  if (!entEditableLayer(L)) SEL = SEL.filter(function (i) { return DOC.ents[i] && DOC.ents[i].layer !== id; });   // can't stay selected
  persist(); renderLayers(); draw();
}
function entEditableLayer(L){ return L.visible && !L.locked; }
function layerRename(id, span){
  var L = layerById(id); if (!L) return;
  var inp = document.createElement('input'); inp.value = L.name; inp.setAttribute('aria-label', 'Layer name');
  span.replaceWith(inp); inp.focus(); inp.select();
  var done = false;
  function commit(save){
    if (done) return; done = true;
    var v = inp.value.trim();
    if (save && v && v !== L.name){ pushUndo(); L.name = v; persist(); }
    renderLayers();
  }
  inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); });
  inp.addEventListener('blur', function () { commit(true); });
  inp.addEventListener('click', function (e) { e.stopPropagation(); });
}
function layerMoveSelection(id){
  if (!SEL.length) return;
  pushUndo();
  SEL.forEach(function (i) { if (DOC.ents[i]) DOC.ents[i].layer = id; });
  var n = SEL.length, L = layerById(id);
  persist(); renderLayers(); draw();
  toast('ok', 'Moved ' + n + (n === 1 ? ' shape' : ' shapes') + ' to \u201c' + L.name + '\u201d', '');
}
function layerDelete(id){
  if (DOC.layers.length < 2) return;
  var L = layerById(id), n = layerCount(id), imgs = layerImages(id).length;
  function go(){
    pushUndo();
    DOC.ents = DOC.ents.filter(function (e) { return e.layer !== id; });
    DOC.images = DOC.images.filter(function (im) { return im.layer !== id; });
    DOC.layers = DOC.layers.filter(function (l) { return l.id !== id; });
    if (DOC.activeLayer === id) DOC.activeLayer = DOC.layers[DOC.layers.length - 1].id;
    SEL = [];
    if (typeof tpRebuildAll === 'function') tpRebuildAll();
    persist(); renderLayers(); renderToolpathPanel(); draw();
  }
  if (!n && !imgs) return go();
  var what = [n ? n + (n === 1 ? ' shape' : ' shapes') : '', imgs ? (imgs === 1 ? 'its reference image' : imgs + ' images') : ''].filter(Boolean).join(' and ');
  uiDialog({title: 'Delete \u201c' + L.name + '\u201d?', body: 'This deletes the layer and ' + what + ' on it. Undo brings them back.', ok: 'Delete', cancel: 'Cancel'})
    .then(function (yes) { if (yes) go(); });
}
function drawLayerImages(ctx){
  (DOC.images || []).forEach(function (im) {
    var L = layerById(im.layer); if (L && !L.visible) return;
    var src = DOC.imageData[im.id]; if (!src) return;
    var c = drawLayerImages.cache || (drawLayerImages.cache = {});
    if (!c[im.id] || c[im.id].src !== src){ var el = new Image(); el.onload = draw; el.src = src; c[im.id] = {src: src, el: el}; }
    var el2 = c[im.id].el; if (!el2.complete || !el2.naturalWidth) return;
    var a = w2s(im.x, im.y + im.h), b = w2s(im.x + im.w, im.y);
    ctx.save(); ctx.globalAlpha = 0.3; ctx.drawImage(el2, a.x, a.y, b.x - a.x, b.y - a.y); ctx.restore();
  });
}
