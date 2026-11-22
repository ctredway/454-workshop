// Display colours. The defaults suit the dark theme; on the light one, a colour still at its default is drawn
// in its light-theme partner instead (near-white shapes on a near-white canvas couldn't be seen). A colour
// you picked is used as it is, on either theme.
var COL_DARK = {vec:'#dce3ea', tp:'#b87f2e', con:'#6b8cae', dim:'#8fb8d8'};
var COL_LIGHT = {vec:'#27303a', tp:'#a8721f', con:'#5a7fa6', dim:'#2f78b3'};
function dispCol(k){ var c = UICFG.colors[k]; return THEME.theme === 'light' && c === COL_DARK[k] ? COL_LIGHT[k] : c; }
function syncColorInputs(){
  [['colVec','vec'],['colTp','tp'],['colCon','con'],['colDim','dim']].forEach(function(pair){
    var inp = document.getElementById(pair[0]);
    if (inp) inp.value = dispCol(pair[1]);
  });
}
var UICFG = {colors:{vec:COL_DARK.vec, tp:COL_DARK.tp, con:COL_DARK.con, dim:COL_DARK.dim}, filletR:3, showDims:true};
function uiCfgLoad(){
  try{
    var c = JSON.parse(localStorage.getItem('d454DesignUI') || localStorage.getItem('kerfDesignUI') || 'null');
    if (c){
      if (c.colors && c.colors.vec && c.colors.tp) UICFG.colors = c.colors;
      if (!UICFG.colors.con) UICFG.colors.con = COL_DARK.con;
      if (!UICFG.colors.dim) UICFG.colors.dim = COL_DARK.dim;
      if (typeof c.showDims === 'boolean') UICFG.showDims = c.showDims;
      if (c.filletR > 0) UICFG.filletR = c.filletR;
      if (c.polySides >= 3) UICFG.polySides = c.polySides;
      if (c.selAnchor) UICFG.selAnchor = c.selAnchor;
      if (typeof c.selLock === 'boolean') UICFG.selLock = c.selLock;
      if (c.starPoints >= 3) UICFG.starPoints = c.starPoints;
      if (c.lastFont) UICFG.lastFont = c.lastFont;
      if (c.filletType) UICFG.filletType = c.filletType;
      if (c.nestGap >= 0) UICFG.nestGap = c.nestGap;
      if (c.nestMargin >= 0) UICFG.nestMargin = c.nestMargin;
      if (c.nestRot) UICFG.nestRot = c.nestRot;
      if (c.stockUnits === 'in' || c.stockUnits === 'mm') UICFG.stockUnits = c.stockUnits;
      if (typeof c.tpPanel === 'boolean') UICFG.tpPanel = c.tpPanel;
      if (typeof c.histBar === 'boolean') UICFG.histBar = c.histBar;
      if (typeof c.ribbonTab === 'string') UICFG.ribbonTab = c.ribbonTab;          // checked where it's used (ribbonTabNow)
      if (typeof c.ribbonFolded === 'boolean') UICFG.ribbonFolded = c.ribbonFolded;
      if (c.rightTab === 'layers' || c.rightTab === 'toolpaths') UICFG.rightTab = c.rightTab;
      if (c.libMachine) UICFG.libMachine = c.libMachine;
      if (typeof c.libMaterial === 'string') UICFG.libMaterial = c.libMaterial;
      if (c.lastTextH > 0) UICFG.lastTextH = c.lastTextH;
      if (c.tabs && typeof c.tabs === 'object') UICFG.tabs = c.tabs;   // checked where it's used (cutTabsStart)
      if (c.lastOffset > 0) UICFG.lastOffset = c.lastOffset;           // the tool panels, as last used: checked where they open
      if (c.polySize && c.polySize.v > 0) UICFG.polySize = c.polySize;
      if (c.starSize > 0) UICFG.starSize = c.starSize;
      ['rectSize', 'ellSize'].forEach(function (k) { if (c[k] && typeof c[k] === 'object') UICFG[k] = c[k]; });
      if (c.rectAt === 'centre' || c.rectAt === 'corner') UICFG.rectAt = c.rectAt;
      if (c.circleD > 0) UICFG.circleD = c.circleD;
      if (c.starInner > 0 && c.starInner < 1) UICFG.starInner = c.starInner;
      ['arrLast', 'rotLast', 'cpyLast'].forEach(function (k) { if (c[k] && typeof c[k] === 'object') UICFG[k] = c[k]; });
    }
  }catch(e){}
}
function uiCfgSave(){
  try{ localStorage.setItem('d454DesignUI', JSON.stringify(UICFG)); }catch(e){}
}
// The right-hand panel's two tabs: the toolpaths, or the layers (which were a tab of the left panel before the
// ribbon). Remembered between visits. Picking a tab while the panel is folded opens it.
function rightTab(name){
  UICFG.rightTab = name === 'layers' ? 'layers' : 'toolpaths';
  if (UICFG.tpPanel === false){ UICFG.tpPanel = true; if (typeof renderToolpathPanel === 'function') renderToolpathPanel(); }
  uiCfgSave();
  rightTabShow();
}
function rightTabShow(){
  var lay = UICFG.rightTab === 'layers';
  var tp = document.getElementById('rpPaneTp'), ly = document.getElementById('rpPaneLayers');
  if (tp) tp.hidden = lay;
  if (ly) ly.hidden = !lay;
  [['rpTabTp', !lay], ['rpTabLayers', lay]].forEach(function (p) {
    var b = document.getElementById(p[0]); if (!b) return;
    b.setAttribute('aria-selected', p[1] ? 'true' : 'false'); b.tabIndex = p[1] ? 0 : -1;
  });
  if (lay && typeof renderLayers === 'function') renderLayers();
}
