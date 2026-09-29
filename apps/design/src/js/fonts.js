var FONT_WARNED = {};
function fontObj(key){
  var f = FONTS[key];
  if (!f){
    if (FONTS_CACHED_READY && !FONT_WARNED[key]){
      FONT_WARNED[key] = true;
      toast('warn', 'Font not available',
        'This drawing uses "' + String(key).replace(/^custom:/, '') + '", which isn\u2019t loaded in this browser. Open the text and load the font file again to see it.');
    }
    return null;
  }
  if (f.font) return f.font;
  if (!f.custom && !f.loading && !f.failed) loadFont(key);
  return null;
}
function loadFont(key){
  var f = FONTS[key];
  if (!f || f.custom || f.loading) return;
  if (typeof opentype === 'undefined'){
    f.failed = true;
    toast('err', 'Text engine didn\u2019t load', 'Text needs an internet connection the first time the page opens. Reload once you\u2019re online.');
    return;
  }
  f.loading = true;
  fetch(FONT_CDN + f.pkg + '/files/' + f.file)
    .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(function(buf){ f.font = opentype.parse(buf); f.loading = false; draw(); })
    .catch(function(){
      f.loading = false; f.failed = true;
      toast('warn', 'Couldn\u2019t load ' + f.name, 'Check your internet connection, or use a font file from your computer.');
      draw();
    });
}
function fontDisplayName(font){
  var n = font.names || {};
  function en(o){ return o ? (o.en || o[Object.keys(o)[0]]) : ''; }
  var fam = en(n.fontFamily) || 'Custom font', sub = en(n.fontSubfamily) || '';
  return {fam:fam, sub:sub, label: fam + (sub && sub !== 'Regular' ? ' ' + sub : '')};
}
// custom fonts persist in IndexedDB (they can be too large for localStorage)
function fontDB(){
  return new Promise(function(res, rej){
    if (!window.indexedDB) return rej(new Error('no indexedDB'));
    var rq = indexedDB.open('d454Fonts', 1);
    rq.onupgradeneeded = function(){ rq.result.createObjectStore('fonts', {keyPath:'key'}); };
    rq.onsuccess = function(){ res(rq.result); };
    rq.onerror = function(){ rej(rq.error); };
  });
}
function registerCustomFont(buf, save){
  var font = opentype.parse(buf);              // throws on unsupported formats (e.g. woff2)
  var dn = fontDisplayName(font);
  var key = 'custom:' + dn.label;
  FONTS[key] = {name: dn.label, custom:true, font:font};
  if (save){
    fontDB().then(function(db){
      db.transaction('fonts', 'readwrite').objectStore('fonts').put({key:key, name:dn.label, buf:buf});
    }).catch(function(){});
  }
  return key;
}
function loadCachedFonts(done){
  fontDB().then(function(db){
    var rq = db.transaction('fonts', 'readonly').objectStore('fonts').getAll();
    rq.onsuccess = function(){
      (rq.result || []).forEach(function(rec){
        try{ if (typeof opentype !== 'undefined') registerCustomFont(rec.buf, false); }catch(e){}
      });
      FONTS_CACHED_READY = true; if (done) done(); draw();
    };
    rq.onerror = function(){ FONTS_CACHED_READY = true; if (done) done(); };
  }).catch(function(){ FONTS_CACHED_READY = true; if (done) done(); });
}
