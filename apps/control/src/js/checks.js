/* ============================================================
   Dynamic checks (envelope / stock) — re-run when settings change
   ============================================================ */
function dynamicChecks(model, cfg){
  var out = [];
  if (!model) return out;
  var segs = model.segs;
  if (cfg.checkEnvelope){
    var x0 = cfg.origin === 'center' ? -cfg.w/2 : 0;
    var y0 = cfg.origin === 'center' ? -cfg.d/2 : 0;
    var x1 = x0 + cfg.w, y1 = y0 + cfg.d;
    var firstLine = null, count = 0;
    for (var i=0;i<segs.length;i++){
      var s = segs[i];
      if (s.x1 < x0-0.01 || s.x1 > x1+0.01 || s.y1 < y0-0.01 || s.y1 > y1+0.01){
        count++;
        if (firstLine === null) firstLine = s.line;
      }
    }
    if (count) out.push({sev:'warn', line:firstLine, msg:'Toolpath leaves the ' + cfg.w + ' × ' + cfg.d + ' mm work area (' + count + ' segments) — first at line ' + firstLine + '. Check machine size and where your job zero is.'});
  }
  if (cfg.stock > 0){
    var deep = null, minZ = 0, dCount = 0;
    for (var j=0;j<segs.length;j++){
      var g = segs[j];
      if (!g.rapid && g.z1 < -cfg.stock - 0.01){
        dCount++; if (deep === null) deep = g.line;
        if (g.z1 < minZ) minZ = g.z1;
      }
    }
    if (dCount) out.push({sev:'warn', line:deep, msg:'Cuts go ' + (Math.abs(minZ) - cfg.stock).toFixed(2) + ' mm below the bottom of ' + cfg.stock + ' mm stock (assuming Z0 = stock top) — first at line ' + deep + '. Intentional for through-cuts into a spoilboard; otherwise check your Z zero.'});
  }
  // rapid plunge check: any rapid ending below Z0 while XY also moves
  var rp = null, rpc = 0;
  for (var k2=0;k2<segs.length;k2++){
    var r = segs[k2];
    if (r.rapid && r.z1 < -0.01 && (Math.abs(r.x1-r.x0)>0.01 || Math.abs(r.y1-r.y0)>0.01)){
      rpc++; if (rp === null) rp = r.line;
    }
  }
  if (rpc) out.push({sev:'warn', line:rp, msg:'Rapid (G0) moves travel laterally below Z0 (' + rpc + ' segments, first at line ' + rp + ') — fine if Z0 is your wasteboard, risky if Z0 is stock top.'});
  return out;
}

