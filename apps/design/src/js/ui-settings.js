var UICFG = {order:null, collapsed:{}, colors:{vec:'#dce3ea', tp:'#b87f2e', con:'#6b8cae', dim:'#8fb8d8'}, filletR:3, showDims:true};
function uiCfgLoad(){
  try{
    var c = JSON.parse(localStorage.getItem('d454DesignUI') || localStorage.getItem('kerfDesignUI') || 'null');
    if (c){
      UICFG.order = c.order || null;
      UICFG.collapsed = c.collapsed || {};
      if (c.colors && c.colors.vec && c.colors.tp) UICFG.colors = c.colors;
      if (!UICFG.colors.con) UICFG.colors.con = '#6b8cae';
      if (!UICFG.colors.dim) UICFG.colors.dim = '#8fb8d8';
      if (typeof c.showDims === 'boolean') UICFG.showDims = c.showDims;
      if (c.filletR > 0) UICFG.filletR = c.filletR;
      if (c.lastFont) UICFG.lastFont = c.lastFont;
      if (c.filletType) UICFG.filletType = c.filletType;
      if (c.nestGap >= 0) UICFG.nestGap = c.nestGap;
      if (c.nestMargin >= 0) UICFG.nestMargin = c.nestMargin;
      if (c.nestRot) UICFG.nestRot = c.nestRot;
      if (c.stockUnits === 'in' || c.stockUnits === 'mm') UICFG.stockUnits = c.stockUnits;
      if (typeof c.tpPanel === 'boolean') UICFG.tpPanel = c.tpPanel;
      if (c.libMachine) UICFG.libMachine = c.libMachine;
      if (typeof c.libMaterial === 'string') UICFG.libMaterial = c.libMaterial;
      if (c.lastTextH > 0) UICFG.lastTextH = c.lastTextH;
    }
  }catch(e){}
}
function uiCfgSave(){
  try{ localStorage.setItem('d454DesignUI', JSON.stringify(UICFG)); }catch(e){}
}
function orderedGroups(){
  if (!UICFG.order) return PANEL_GROUPS.slice();
  var byId = {}; PANEL_GROUPS.forEach(function(g){ byId[g.id] = g; });
  var out = [];
  UICFG.order.forEach(function(id){ if (byId[id]){ out.push(byId[id]); delete byId[id]; } });
  PANEL_GROUPS.forEach(function(g){ if (byId[g.id]) out.push(g); }); // new groups append
  return out;
}
// Which side-panel tab is showing: the drawing tools, or the layers. Remembered between visits.
function sideTab(name){
  UICFG.sideTab = name === 'layers' ? 'layers' : 'tools';
  uiCfgSave();
  var tools = document.getElementById('paneTools'), layers = document.getElementById('paneLayers');
  if (tools) tools.hidden = UICFG.sideTab !== 'tools';
  if (layers) layers.hidden = UICFG.sideTab !== 'layers';
  ['sideTabTools', 'sideTabLayers'].forEach(function (id) {
    var b = document.getElementById(id); if (!b) return;
    var on = (id === 'sideTabLayers') === (UICFG.sideTab === 'layers');
    b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
  });
  if (UICFG.sideTab === 'layers' && typeof renderLayers === 'function') renderLayers();
}
