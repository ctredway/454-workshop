/* ---------------- job streaming ---------------- */
function inflightBytes(){
  var n = 0;
  for (var i = 0; i < JOB.inflight.length; i++) n += JOB.inflight[i].len;
  return n;
}

