function logC(cls, text){
  var log = document.getElementById('consoleLog');
  var d = document.createElement('div');
  d.className = cls;
  d.textContent = (cls === 'tx' ? '→ ' : '') + text;
  log.appendChild(d);
  while (log.childNodes.length > 600) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function rawWrite(u8){
  if (!SERIAL.writer) return;
  SERIAL.writeChain = SERIAL.writeChain.then(function(){
    return SERIAL.writer.write(u8);
  }).catch(function(e){ logC('err', 'write failed: ' + e.message); });
}
function sendLine(s, quiet){
  if (!SERIAL.connected) return;
  if (!quiet) logC('tx', s);
  rawWrite(new TextEncoder().encode(s + '\n'));
}
function sendRT(byte, label){
  if (!SERIAL.connected) return;
  if (label) logC('tx', label);
  rawWrite(new Uint8Array([byte]));
}

// The last controller used, by USB identity. Chrome keeps the permission, so reconnecting to it
// needs no port picker. Only an unambiguous match is reused, never a guess between devices.
function portKey(port){ var i = port.getInfo ? port.getInfo() : {}; return {v: i.usbVendorId || null, p: i.usbProductId || null}; }
async function rememberedPort(){
  if (!SERIAL.supported || !navigator.serial.getPorts) return null;
  var saved = null;
  try{ saved = JSON.parse(localStorage.getItem('454-control-port') || 'null'); }catch(e){}
  if (!saved || saved.v === null) return null;
  var ports = await navigator.serial.getPorts();
  var hits = ports.filter(function(pt){ var k = portKey(pt); return k.v === saved.v && k.p === saved.p; });
  return hits.length === 1 ? hits[0] : null;
}
async function refreshConnectLabel(){
  if (SERIAL.connected) return;
  var rp = null;
  try{ rp = await rememberedPort(); }catch(e){}
  if (SERIAL.connected) return;
  document.getElementById('connectBtn').textContent = rp ? 'Reconnect to machine' : 'Connect to machine';
  document.getElementById('choosePort').hidden = !rp;
}
async function serialConnect(pick){
  if (SERIAL.connected){ serialDisconnect(); return; }
  if (!SERIAL.supported){
    uiNote('This browser can’t talk to the machine', 'Web Serial is needed. Use Chrome or Edge on desktop — opening the file locally is fine.');
    return;
  }
  try{
    var port = pick === true ? null : await rememberedPort();
    if (!port) port = await navigator.serial.requestPort();
    await port.open({baudRate: 115200});
    try{ localStorage.setItem('454-control-port', JSON.stringify(portKey(port))); }catch(e){}
    SERIAL.port = port;
    SERIAL.writer = port.writable.getWriter();
    SERIAL.reader = port.readable.getReader();
    SERIAL.writeChain = Promise.resolve();
    SERIAL.connected = true;
    SERIAL.lineBuf = '';
    SERIAL.settings = {}; SERIAL.offsets = {}; SERIAL.buildInfo = '';
    SERIAL.queried = false; SERIAL.rateApplied = false; SERIAL.jogRateApplied = false; SERIAL.accelApplied = false;
    SERIAL.homedSeen = false; SERIAL.prevState = ''; HOME_ASKED = false;
    PROBE.active = false; PROBE.onDone = null; PROBE.refZ = null; PROBE.previewDone = false;
    if (typeof bsRefNote === 'function') bsRefNote();
    uiConn(true);
    logC('sys', 'port open @ 115200 — waiting for GRBL');
    readLoop();
    setTimeout(function(){ rawWrite(new Uint8Array([10, 10])); }, 150); // wake
    SERIAL.pollTimer = setInterval(function(){
      if (SERIAL.connected) sendRT(0x3f); // '?' status query
    }, 250);
    setTimeout(function(){ if (SERIAL.connected) doQuery(); }, 1500); // boards already awake send no banner
  }catch(e){
    logC('err', 'connect failed: ' + e.message);
  }
}

async function serialDisconnect(){
  logC('sys', 'disconnecting');
  SERIAL.connected = false;
  if (SERIAL.pollTimer){ clearInterval(SERIAL.pollTimer); SERIAL.pollTimer = null; }
  try{ if (SERIAL.reader) await SERIAL.reader.cancel(); }catch(e){}
}

// anything that would be dangerous to cut off by reloading or closing the page
function machineBusy(){
  if (JOB.active || PROBE.active || QA.active || JOGC.active) return true;
  if (!SERIAL.connected) return false;
  return SERIAL.spindleOn || /^(Run|Jog|Hold|Home|Door)/.test(SERIAL.state || '');
}
function serialCleanup(){
  if (JOB.active) recoveryNote('connection lost');
  if (SERIAL.pollTimer){ clearInterval(SERIAL.pollTimer); SERIAL.pollTimer = null; }
  try{ if (SERIAL.reader) SERIAL.reader.releaseLock(); }catch(e){}
  try{ if (SERIAL.writer) SERIAL.writer.releaseLock(); }catch(e){}
  try{ if (SERIAL.port) SERIAL.port.close(); }catch(e){}
  SERIAL.port = null; SERIAL.reader = null; SERIAL.writer = null;
  SERIAL.connected = false; SERIAL.state = 'offline';
  if (JOB.active){
    JOB.active = false;
    logC('err', 'job aborted — connection lost');
    updateJobUI('connection lost');
  }
  uiConn(false);
}

async function readLoop(){
  var dec = new TextDecoder();
  try{
    while (SERIAL.reader){
      var r = await SERIAL.reader.read();
      if (r.done) break;
      SERIAL.lineBuf += dec.decode(r.value, {stream:true});
      var parts = SERIAL.lineBuf.split(/\r?\n/);
      SERIAL.lineBuf = parts.pop();
      for (var i = 0; i < parts.length; i++){
        var ln = parts[i].trim();
        if (ln) handleRx(ln);
      }
    }
  }catch(e){
    if (SERIAL.connected) logC('err', 'serial read error: ' + e.message);
  }
  serialCleanup();
}

function handleRx(line){
  if (line[0] === '<'){ parseStatus(line); if (SERIAL.verbose) logC('rx', line); return; }
  if (line === 'ok'){
    if (PROBE.active){ probeNext(); return; }
    if (QA.active){ if (SERIAL.verbose) logC('ok', 'ok'); qaNext(); return; }
    if (JOGC.active || JOGC.inflight > 0){
      if (JOGC.inflight > 0) JOGC.inflight--;
      jogTopUp();
      if (SERIAL.verbose) logC('ok', 'ok');
      return;
    }
    if (SERIAL.verbose || !JOB.active) logC('ok', 'ok');
    onAck(true, 0);
    return;
  }
  if (line.indexOf('error:') === 0){
    var c = parseInt(line.slice(6), 10);
    if (PROBE.active){ probeFail('error:' + c + ' — ' + (GRBL_ERRORS[c] || '')); return; }
    if (QA.active){
      logC('err', line + ' — ' + (GRBL_ERRORS[c] || 'see GRBL error list'));
      qaFinish(false, 'the controller rejected "' + QA.lines[QA.i - 1] + '"');
      return;
    }
    if (JOGC.active || JOGC.inflight > 0){
      if (JOGC.inflight > 0) JOGC.inflight--;
      if (c === 15){
        if (JOGC.timer){ clearInterval(JOGC.timer); JOGC.timer = null; }
        if (!JOGC.limitHit){ JOGC.limitHit = true; logC('err', 'jog stopped — travel limit reached'); }
        return;
      }
    }
    logC('err', line + ' — ' + (GRBL_ERRORS[c] || 'see GRBL error list'));
    onAck(false, c);
    return;
  }
  if (line.indexOf('ALARM:') === 0){
    var a = parseInt(line.slice(6), 10);
    SERIAL.homedSeen = false; // position no longer trusted until re-homed
    logC('err', line + ' — ' + (GRBL_ALARMS[a] || 'alarm'));
    if (PROBE.active){
      var atxt = GRBL_ALARMS[a] || ('alarm ' + a);
      probeFail(atxt);
      if (a === 4 || a === 5){
        // A probe alarm leaves the machine locked, so say what happened and offer the way out.
        uiDialog({title:'The probe didn\u2019t finish',
                  body: atxt + '\n\n' +
                        (a === 5 ? 'The tool never touched the plate within its search travel. Jog the tip closer \u2014 2 to 10 mm above the plate \u2014 and probe again.'
                                 : 'The probe circuit was already closed when the move started. Check the clip is on the tool and the plate isn\u2019t touching the bit.') +
                        '\n\nThe machine is locked until it is unlocked or homed.',
                  ok:'Unlock ($X)', cancel:'Leave locked'}).then(function(go){
          if (go && SERIAL.connected) sendLine('$X');
        });
      }
      return;
    }
    if (QA.active) qaFinish(false, 'ALARM:' + a);
    if (JOB.active) recoveryNote('ALARM:' + a);
    if (JOB.active){ JOB.active = false; updateJobUI('ALARM — job aborted'); }
    return;
  }
  if (line.indexOf('Grbl') === 0){
    if (QA.active) qaFinish(false, 'the controller was reset');
    logC('sys', line); doQuery(); return;
  }
  var sm = /^\$(\d+)\s*=\s*(-?[\d.]+)/.exec(line);
  if (sm){
    SERIAL.settings[parseInt(sm[1], 10)] = parseFloat(sm[2]);
    logC('rx', line);
    scheduleCfgApply();
    return;
  }
  var bm = /^\[(G54|G55|G56|G57|G58|G59|G28|G30|G92|TLO|PRB|VER|OPT):([^\]]*)\]/.exec(line);
  if (bm){
    if (bm[1] === 'VER' || bm[1] === 'OPT') SERIAL.buildInfo += (SERIAL.buildInfo ? ' ' : '') + bm[1] + ':' + bm[2];
    if (bm[1] === 'OPT') SERIAL.forceOrigin = /Z/.test(bm[2].split(',')[0]);   // homing sets the origin
    else {
      var parts2 = bm[2].split(':');
      var coords = parts2[0].split(',').map(parseFloat);
      if (SERIAL.settings[13] === 1) coords = coords.map(function (q) { return q * 25.4; });   // $# in inches too
      SERIAL.offsets[bm[1]] = coords;
      if (bm[1] === 'PRB') probeOnPRB(coords[2], parts2[1] === '1');
    }
    logC('rx', line);
    return;
  }
  logC('rx', line); // [MSG:...], help text, etc.
}

