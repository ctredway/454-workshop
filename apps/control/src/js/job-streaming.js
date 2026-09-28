/* ---------------- job streaming ---------------- */
// Split a line into its code and its comments. Parentheses may nest: CAM posts can write
// "(Tool: End Mill (2.5 mm))", and a plain "(...)" pattern would stop at the first ")" and
// leave a stray ")" to be sent to the controller. A ";" outside parentheses ends the line.
function splitGcodeComments(raw){
  var code = '', cur = '', comments = [], depth = 0;
  for (var i = 0; i < raw.length; i++){
    var ch = raw.charAt(i);
    if (depth === 0 && ch === ';'){ comments.push(raw.slice(i + 1)); break; }
    if (ch === '('){ if (depth > 0) cur += ch; else code += ' '; depth++; continue; }
    if (ch === ')' && depth > 0){
      depth--;
      if (depth === 0){ comments.push(cur); cur = ''; } else cur += ch;
      continue;
    }
    if (depth > 0) cur += ch; else code += ch;
  }
  if (depth > 0) comments.push(cur);            // unclosed: the rest of the line is comment
  return {code: code.trim(), comments: comments};
}
function cleanForSend(raw){
  return splitGcodeComments(raw).code;
}
function inflightBytes(){
  var n = 0;
  for (var i = 0; i < JOB.inflight.length; i++) n += JOB.inflight[i].len;
  return n;
}

