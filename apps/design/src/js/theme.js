// ---- Tool details: one bit, as the project uses it and as the library knows it ----
// ctx = {ptool:{num,name,rpm}, machineId, materialId, usedBy:[{name,type}]}. Built to be reused
// by CAM, where a toolpath's tool can be changed.
// In-app dialogs, so nothing has to fall back to the browser's own boxes.
// THEMES. One accent colour drives the app. Kept under a shared key so 454 Control and
// 454 Design use the same look, and picked up live if the other app changes it.
var ACCENTS = {gold:'#e8a33d', red:'#e0533d', blue:'#4d9be6', green:'#4cc46a', purple:'#b07fe0', teal:'#3fbfae'};
var THEME = {theme:'dark', accent:'#e8a33d', accentLight:'#ffc96b'};
// The canvas's background furniture: faint on either background, so the drawing stands out.
function canvasPal(){
  return THEME.theme === 'light'
    ? {grid: '#e2e7ec', axes: '#c3ccd5', stock: '#8a9bab', stockFill: 'rgba(81,97,122,0.06)'}
    : {grid: '#1b2129', axes: '#2a323c', stock: '#51617a', stockFill: 'rgba(81,97,122,0.05)'};
}
function themeRead(){
  try{
    var t = JSON.parse(localStorage.getItem('454-theme') || 'null');
    if (t && typeof t === 'object') return t;
  }catch(e){}
  return {theme:'dark', accent:'gold'};
}
function themeWrite(t){ try{ localStorage.setItem('454-theme', JSON.stringify(t)); }catch(e){} }
function hexToRgb(h){
  h = String(h || '').replace('#','');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var v = parseInt(h, 16);
  if (!isFinite(v)) return {r:232, g:163, b:61};
  return {r:(v>>16)&255, g:(v>>8)&255, b:v&255};
}
function accentRGBA(a){ var c = hexToRgb(THEME.accent); return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }
function mixWhite(hex, amt){
  var c = hexToRgb(hex);
  function m(v){ return Math.round(v + (255 - v) * amt); }
  return '#' + [m(c.r), m(c.g), m(c.b)].map(function(v){ return ('0' + v.toString(16)).slice(-2); }).join('');
}
function applyTheme(t){
  var cfg = t || themeRead();
  THEME.theme = cfg.theme === 'light' ? 'light' : 'dark';
  THEME.accent = cfg.accent === 'custom' ? (cfg.accentHex || ACCENTS.gold) : (ACCENTS[cfg.accent] || ACCENTS.gold);
  THEME.accentLight = mixWhite(THEME.accent, THEME.theme === 'light' ? 0 : 0.42);
  var root = document.documentElement, c = hexToRgb(THEME.accent);
  root.setAttribute('data-theme', THEME.theme);
  root.style.setProperty('--amber', THEME.accent);
  root.style.setProperty('--accent-soft', 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',.16)');
  root.style.setProperty('--accent-faint', 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',.08)');
  var lum = (0.299*c.r + 0.587*c.g + 0.114*c.b) / 255;
  root.style.setProperty('--on-accent', lum > 0.6 ? '#14181d' : '#fff');
  if (typeof syncColorInputs === 'function') syncColorInputs();   // the swatches show the colours as drawn
  try{ draw(); }catch(e){}
}
