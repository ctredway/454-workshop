// THEMES. One accent colour drives the whole app: it is --amber in the stylesheet, with two
// translucent versions for highlights, and a matching text colour for filled buttons. The 3D
// view can't use CSS variables, so it reads them back after a theme is applied.
var ACCENTS = {gold:'#e8a33d', red:'#e0533d', blue:'#4d9be6', green:'#4cc46a', purple:'#b07fe0', teal:'#3fbfae'};
function hexToRgb(h){
  h = String(h || '').replace('#','');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var v = parseInt(h, 16);
  if (!isFinite(v)) return {r:232, g:163, b:61};
  return {r:(v>>16)&255, g:(v>>8)&255, b:v&255};
}
var UITHEME = {theme:'dark', accent:'gold', accentHex:ACCENTS.gold};
function themeLoad(){
  try{
    var t = JSON.parse(localStorage.getItem('454-theme') || 'null');
    if (t && typeof t === 'object') UITHEME = {theme:t.theme || 'dark', accent:t.accent || 'gold', accentHex:t.accentHex || ACCENTS.gold};
  }catch(e){}
  return UITHEME;
}
function themeSave(){ try{ localStorage.setItem('454-theme', JSON.stringify(UITHEME)); }catch(e){} }
function accentColour(){
  if (UITHEME.accent === 'custom') return UITHEME.accentHex || ACCENTS.gold;
  return ACCENTS[UITHEME.accent] || ACCENTS.gold;
}
// The 3D view is WebGL, so it can't use CSS variables: it reads them back and restyles itself.
function cssNum(name, fallback){
  try{
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) return fallback;
    if (v.charAt(0) === '#') return parseInt(v.slice(1).length === 3 ? v.slice(1).replace(/(.)/g,'$1$1') : v.slice(1), 16);
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
    if (m) return (+m[1] << 16) | (+m[2] << 8) | (+m[3]);
  }catch(e){}
  return fallback;
}
function themeScene(){
  if (typeof scene === 'undefined' || !scene) return;
  var light = UITHEME.theme === 'light';
  if (scene.background && scene.background.setHex) scene.background.setHex(cssNum('--bg', light ? 0xeef1f4 : 0x14181d));
  // The grid is a group of line sets, so it's rebuilt in the new colours rather than recoloured
  // (recolouring looked for a single material and silently missed it, leaving a black grid).
  if (typeof buildStage === 'function' && typeof gridObj !== 'undefined' && gridObj) buildStage();
  applyViewPal();
  repaintToolpath();
  if (typeof envObj !== 'undefined' && envObj && envObj.material && envObj.material.color)
    envObj.material.color.setHex(light ? 0x8fa2b5 : 0x51617a);
  if (typeof originDot !== 'undefined' && originDot && originDot.material && originDot.material.color)
    originDot.material.color.setHex(cssNum('--amber', 0xe8a33d));
}
function applyTheme(save){
  if (save !== false) themeSave();
  var root = document.documentElement;
  root.setAttribute('data-theme', UITHEME.theme === 'light' ? 'light' : 'dark');
  var hex = accentColour(), c = hexToRgb(hex);
  root.style.setProperty('--amber', hex);
  root.style.setProperty('--accent-soft', 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',.16)');
  root.style.setProperty('--accent-faint', 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',.08)');
  // dark text on a light accent, light text on a dark one
  var lum = (0.299*c.r + 0.587*c.g + 0.114*c.b) / 255;
  root.style.setProperty('--on-accent', lum > 0.6 ? '#14181d' : '#fff');
  if (typeof themeScene === 'function') themeScene();
  if (typeof draw === 'function') try{ draw(); }catch(e){}
}
var originDot = null;
