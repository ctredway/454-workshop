/* ---------------- job recovery ----------------
   stateAtLine: lightweight modal walk (no tessellation) reproducing the
   parser's interpretation up to — but not including — the target line. */
function stateAtLine(target){
  var st = {units:'mm', abs:true, arcAbs:false, plane:17, motion:null,
            feedRaw:null, sVal:null, spindle:false, tool:null, pendingTool:null,
            x:0, y:0, z:0, uncertain:false};
  function toMM(v){ return st.units === 'in' ? v * 25.4 : v; }
  var re = /([A-Za-z])\s*([+-]?(?:\d+\.?\d*|\.\d+))/g;
  for (var li = 0; li < target - 1 && li < MODEL.lines.length; li++){
    var code = splitGcodeComments(MODEL.lines[li]).code;
    if (!code || code === '%') continue;
    var m, params = {}, gs = [], ms = [];
    re.lastIndex = 0;
    while ((m = re.exec(code)) !== null){
      var L = m[1].toUpperCase(), V = parseFloat(m[2]);
      if (L === 'G') gs.push(V);
      else if (L === 'M') ms.push(V);
      else if (L === 'F') st.feedRaw = V;
      else if (L === 'S') st.sVal = V;
      else if (L === 'T') st.pendingTool = V;
      else params[L.toLowerCase()] = V;
    }
    var skip = false;
    for (var g = 0; g < gs.length; g++){
      var gv = gs[g];
      if (gv === 0 || gv === 1 || gv === 2 || gv === 3) st.motion = gv;
      else if (gv === 17 || gv === 18 || gv === 19) st.plane = gv;
      else if (gv === 20) st.units = 'in';
      else if (gv === 21) st.units = 'mm';
      else if (gv === 90) st.abs = true;
      else if (gv === 91) st.abs = false;
      else if (gv === 90.1) st.arcAbs = true;
      else if (gv === 91.1) st.arcAbs = false;
      else if (gv === 28 || gv === 28.2 || gv === 53){ skip = true; if (params.x !== undefined || params.y !== undefined || params.z !== undefined) st.uncertain = true; }
      else if (gv === 92 || gv === 10) st.uncertain = true;
      else if (gv >= 54 && gv < 60 && Math.abs(gv - 54) > 1e-6) st.uncertain = true;   // switched away from G54
      else if (gv >= 38 && gv < 39) skip = true;
      else if (gv === 81 || gv === 82 || gv === 83 || gv === 73) skip = true;
    }
    for (var q = 0; q < ms.length; q++){
      if (ms[q] === 3 || ms[q] === 4) st.spindle = true;
      else if (ms[q] === 5) st.spindle = false;
      else if (ms[q] === 6){ st.tool = st.pendingTool !== null ? st.pendingTool : st.tool; }
    }
    if (!skip && st.motion !== null &&
        (params.x !== undefined || params.y !== undefined || params.z !== undefined)){
      if (st.abs){
        if (params.x !== undefined) st.x = toMM(params.x);
        if (params.y !== undefined) st.y = toMM(params.y);
        if (params.z !== undefined) st.z = toMM(params.z);
      } else {
        if (params.x !== undefined) st.x += toMM(params.x);
        if (params.y !== undefined) st.y += toMM(params.y);
        if (params.z !== undefined) st.z += toMM(params.z);
      }
    }
  }
  return st;
}

/* snap backward over bare-coordinate continuation lines to one that carries
   an explicit motion word (a G2/G3 modal chain cannot be entered mid-way) */
function recoverySnap(target){
  var ln = target;
  while (ln > 1){
    if (MODEL.lineFirstSeg[ln] === undefined){ ln--; continue; } // no motion on this line
    var code = splitGcodeComments(MODEL.lines[ln - 1]).code;
    if (/G\s*0*[0123](?![0-9.])/i.test(code)) return ln;
    ln--;
  }
  return null;
}
