/* ============================================================
   TOOL LIBRARY
   Mirrors VCarve's model: a bit's shape, a tool number per machine, and
   cutting values per machine + material, each value keeping its own units.
   Imported straight from VCarve's tools.vtdb (a SQLite file, read in the
   browser with sql.js). Stored in IndexedDB, so every 454 app on this site
   (Design, Control, CAM) sees the same library.
   ============================================================ */
var TOOLLIB = null;                     // the library, once loaded
var SQLJS_BASE = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.2/dist/';
var TOOL_TYPES = {0:'Ball Nose', 1:'End Mill', 2:'Radiused End Mill', 3:'V-Bit', 4:'Engraving',
                  5:'Tapered Ball Nose', 6:'Drill', 8:'Form Tool', 9:'Diamond Drag'};
var RATE_UNITS = {1:'mm/min', 4:'in/min'};     // the two codes in real libraries; others are shown as codes
function libTrim(v, dp){ return String(+(+v).toFixed(dp === undefined ? 4 : dp)); }
function libFraction(v){                        // inches as VCarve shows them: 0.25 -> 1/4, 1.25 -> 1 1/4
  var n = Math.round(v * 64);
  if (Math.abs(v * 64 - n) > 1e-6 || n === 0) return libTrim(v);
  var whole = Math.floor(n / 64), rem = n % 64, den = 64;
  while (rem && rem % 2 === 0){ rem /= 2; den /= 2; }
  return (whole ? whole + (rem ? ' ' : '') : '') + (rem ? rem + '/' + den : '');
}
// VCarve builds most tool names from a template, e.g. {Tool Type} ({Diameter|F}{Units Short})
function libRenderName(fmt, t){
  if (!fmt) return TOOL_TYPES[t.type] || 'Tool';
  if (fmt.indexOf('{') < 0) return fmt.trim();
  var inch = t.units === 'in';
  function num(v, f){
    if (v === null || v === undefined) return '?';
    if (f === 'F') return inch ? libFraction(v) : libTrim(v);
    var m = /^\.(\d+)$/.exec(f || '');            // '.0' = one decimal place, '.00' = two (60.0\u00b0)
    return m ? (+v).toFixed(m[1].length) : libTrim(v);
  }
  return fmt.replace(/\{([^}|]+)(?:\|([^}]*))?\}/g, function(_, key, f){
    key = key.trim();
    if (key === 'Tool Type') return TOOL_TYPES[t.type] || 'Tool';
    if (key === 'Diameter') return num(t.diameter, f);
    if (key === 'Included Angle' || key === 'Side Angle') return num(t.angle, f);
    if (key === 'Flat Diameter') return num(t.flat, f);
    if (key === 'Units Short') return inch ? '"' : ' mm';
    if (key === 'Line Width') return t.lineWidth !== null && t.lineWidth !== undefined ? num(t.lineWidth) : '?';
    return '';
  }).trim();
}
// sql.js is ~700 KB, so it's fetched only when someone imports a library
function libLoadSql(){
  return new Promise(function(res, rej){
    if (window.initSqlJs) return res(window.initSqlJs);
    var sc = document.createElement('script');
    sc.src = SQLJS_BASE + 'sql-wasm.js';
    sc.onload = function(){ window.initSqlJs ? res(window.initSqlJs) : rej(new Error('sql.js did not load')); };
    sc.onerror = function(){ rej(new Error('could not download the database reader')); };
    document.head.appendChild(sc);
  }).then(function(init){ return init({locateFile: function(f){ return SQLJS_BASE + f; }}); });
}
// read a VCarve tools.vtdb (as a sql.js Database) into 454's library format
function libFromVtdb(db, fileName){
  function rows(sql){
    var r = db.exec(sql);
    if (!r.length) return [];
    var cols = r[0].columns;
    return r[0].values.map(function(v){ var o = {}; cols.forEach(function(c, i){ o[c] = v[i]; }); return o; });
  }
  var need = ['tool_geometry', 'tool_entity', 'tool_cutting_data'];
  var have = rows("select name from sqlite_master where type='table'").map(function(r){ return r.name; });
  need.forEach(function(t){ if (have.indexOf(t) < 0) throw new Error('not a VCarve tool database (no ' + t + ' table)'); });
  var machines = have.indexOf('machine') >= 0 ? rows('select id, name, make, model, controller_type from machine') : [];
  var materials = have.indexOf('material') >= 0 ? rows('select id, name from material') : [];
  var tools = {}, order = [];
  rows('select * from tool_geometry').forEach(function(g){
    tools[g.id] = {id:g.id, fmt:g.name_format || '', type:g.tool_type, typeName: TOOL_TYPES[g.tool_type] || ('type ' + g.tool_type),
                   units: g.units === 1 ? 'in' : 'mm', diameter:g.diameter, angle:g.included_angle, flat:g.flat_diameter,
                   tipRadius:g.tip_radius, flutes:g.num_flutes, fluteLength:g.flute_length, notes:g.notes || '',
                   numbers:{}, cuts:[], lineWidth:null};
    order.push(g.id);
  });
  rows('select e.tool_geometry_id gid, e.machine_id mid, e.material_id matid, d.* from tool_entity e join tool_cutting_data d on d.id = e.tool_cutting_data_id')
    .forEach(function(r){
      var t = tools[r.gid];
      if (!t) return;
      if (r.tool_number !== null && r.tool_number !== undefined) t.numbers[r.mid || ''] = r.tool_number;   // numbers belong to a machine
      if (r.line_width !== null && r.line_width !== undefined && t.lineWidth === null) t.lineWidth = r.line_width;
      if (r.feed_rate === null && r.plunge_rate === null && r.spindle_speed === null && r.stepdown === null) return;
      t.cuts.push({machine:r.mid || null, material:r.matid || null, rateUnits:r.rate_units, lengthUnits: r.length_units === 1 ? 'in' : 'mm',
                   feed:r.feed_rate, plunge:r.plunge_rate, rpm:r.spindle_speed, stepdown:r.stepdown, stepover:r.stepover,
                   clearStepover:r.clear_stepover, notes:r.notes || ''});
    });
  order.forEach(function(id){ tools[id].name = libRenderName(tools[id].fmt, tools[id]); });
  // VCarve's folder tree; anything not in it lands in "Other tools"
  var tree = [];
  if (have.indexOf('tool_tree_entry') >= 0){
    var ents = rows('select id, parent_group_id pid, sibling_order ord, tool_geometry_id gid, name from tool_tree_entry');
    var byId = {};
    ents.forEach(function(e){ byId[e.id] = {id:e.id, name:e.name || '', tool:e.gid || null, ord:e.ord || 0, kids:[]}; });
    ents.forEach(function(e){
      var node = byId[e.id];
      if (e.pid && byId[e.pid]) byId[e.pid].kids.push(node); else tree.push(node);
    });
    (function sortAll(list){ list.sort(function(a, b){ return a.ord - b.ord; }); list.forEach(function(n){ sortAll(n.kids); }); })(tree);
    var inTree = {};
    ents.forEach(function(e){ if (e.gid) inTree[e.gid] = true; });
    var loose = order.filter(function(id){ return !inTree[id]; });
    if (loose.length) tree.push({id:'_loose', name:'Other tools', tool:null, ord:1e9, kids:loose.map(function(id){ return {id:'_l' + id, tool:id, kids:[]}; })});
  } else {
    tree.push({id:'_all', name:'All tools', tool:null, kids:order.map(function(id){ return {id:'_a' + id, tool:id, kids:[]}; })});
  }
  (function prune(list){ list.forEach(function(n){ delete n.ord; prune(n.kids); }); })(tree);
  return {v:1, source:{file:fileName || 'tools.vtdb', importedAt:Date.now()},
          machines: machines.map(function(m){ return {id:m.id, name:m.name || 'Machine', make:m.make || '', model:m.model || '', controller:m.controller_type || ''}; }),
          materials: materials.map(function(m){ return {id:m.id, name:m.name || 'Material'}; }),
          tools: order.map(function(id){ return tools[id]; }), tree: tree};
}
// ---- storage (IndexedDB is shared by every page on this site) ----
function libDB(){
  return new Promise(function(res, rej){
    if (!window.indexedDB) return rej(new Error('no indexedDB'));
    var rq = indexedDB.open('d454Tools', 1);
    rq.onupgradeneeded = function(){ rq.result.createObjectStore('lib'); };
    rq.onsuccess = function(){ res(rq.result); };
    rq.onerror = function(){ rej(rq.error); };
  });
}
function libSave(lib){
  return libDB().then(function(db){
    return new Promise(function(res, rej){
      var tx = db.transaction('lib', 'readwrite');
      tx.objectStore('lib').put(lib, 'main');
      tx.oncomplete = function(){ res(); }; tx.onerror = function(){ rej(tx.error); };
    });
  });
}
function libLoad(){
  return libDB().then(function(db){
    return new Promise(function(res){
      var rq = db.transaction('lib', 'readonly').objectStore('lib').get('main');
      rq.onsuccess = function(){ res(rq.result || null); };
      rq.onerror = function(){ res(null); };
    });
  }).catch(function(){ return null; });
}
function libClear(){
  return libDB().then(function(db){
    return new Promise(function(res){ var tx = db.transaction('lib', 'readwrite'); tx.objectStore('lib').delete('main'); tx.oncomplete = function(){ res(); }; });
  });
}
// ---- lookups ----
function libTool(id){ if (!TOOLLIB) return null; for (var i = 0; i < TOOLLIB.tools.length; i++) if (TOOLLIB.tools[i].id === id) return TOOLLIB.tools[i]; return null; }
function libMachineName(id){ if (!TOOLLIB) return ''; for (var i = 0; i < TOOLLIB.machines.length; i++) if (TOOLLIB.machines[i].id === id) return TOOLLIB.machines[i].name; return ''; }
function libMaterialName(id){ if (!TOOLLIB) return ''; for (var i = 0; i < TOOLLIB.materials.length; i++) if (TOOLLIB.materials[i].id === id) return TOOLLIB.materials[i].name; return ''; }
// the machine to use when the project doesn't say: the one chosen in the library, else the one with the most numbered tools
function libDefaultMachine(){
  if (!TOOLLIB || !TOOLLIB.machines.length) return null;
  if (UICFG.libMachine && libMachineName(UICFG.libMachine)) return UICFG.libMachine;
  var best = null, bestN = -1;
  TOOLLIB.machines.forEach(function(m){
    var n = TOOLLIB.tools.filter(function(t){ return t.numbers[m.id] !== undefined; }).length;
    if (n > bestN){ best = m.id; bestN = n; }
  });
  return best;
}
// Match a tool from a project (name + tool number) against the library, for one machine.
// Name finds the bit; the number is then checked, and a difference is REPORTED, never hidden.
function libMatch(ptool, machineId){
  if (!TOOLLIB || !ptool) return {status:'nolib'};
  var nm = String(ptool.name || '').trim().toLowerCase();
  var cands = TOOLLIB.tools.filter(function(t){ return String(t.name).trim().toLowerCase() === nm; });
  if (!cands.length) return {status:'missing'};
  var same = cands.filter(function(t){ return t.numbers[machineId] === ptool.num; });
  if (same.length) return {status:'match', tool:same[0], machine:machineId};
  var numbered = cands.filter(function(t){ return t.numbers[machineId] !== undefined; });
  var t0 = numbered[0] || cands[0];
  return {status:'number', tool:t0, machine:machineId, libNum: t0.numbers[machineId]};
}
function libCutFor(tool, machineId, materialId){
  for (var i = 0; i < tool.cuts.length; i++){ var c = tool.cuts[i]; if (c.machine === machineId && c.material === materialId) return c; }
  return null;
}
function libCutText(c){
  var ru = RATE_UNITS[c.rateUnits] || ('rate code ' + c.rateUnits), lu = c.lengthUnits === 'in' ? ' in' : ' mm';
  var parts = [];
  if (c.feed !== null) parts.push('feed ' + libTrim(c.feed, 2) + ' ' + ru);
  if (c.plunge !== null) parts.push('plunge ' + libTrim(c.plunge, 2));
  if (c.rpm !== null) parts.push(c.rpm + ' rpm');
  if (c.stepdown !== null) parts.push('stepdown ' + libTrim(c.stepdown) + lu);
  if (c.stepover !== null) parts.push('stepover ' + libTrim(c.stepover) + lu);
  return parts.join(' \u00b7 ');
}

