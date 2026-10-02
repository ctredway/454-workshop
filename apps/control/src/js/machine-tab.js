/* ---------------- machine tab wiring ---------------- */
function wireMachine(){
  document.getElementById('connectBtn').addEventListener('click', function(){ serialConnect(false); });
  document.getElementById('choosePort').addEventListener('click', function(){ serialConnect(true); });
  if (SERIAL.supported && navigator.serial.addEventListener){        // plugging the controller in or out
    navigator.serial.addEventListener('connect', refreshConnectLabel);
    navigator.serial.addEventListener('disconnect', refreshConnectLabel);
  }
  refreshConnectLabel();
  // ---- leaving the page while the machine is working ----
  window.addEventListener('beforeunload', function(e){
    if (!machineBusy()) return;
    e.preventDefault(); e.returnValue = '';                        // the browser shows its own "Leave site?" prompt
    return '';
  });
  window.addEventListener('pagehide', function(){
    // Leaving anyway mid-job: streaming would stop with the spindle still running in the cut.
    // A controller reset stops motion and the spindle. Best effort: browsers may not deliver it.
    if (SERIAL.connected && (JOB.active || PROBE.active || QA.active || SERIAL.spindleOn)){
      try{ rawWrite(new Uint8Array([0x18])); }catch(e){}
    }
  });
  if (SERIAL.supported && navigator.serial.addEventListener){
    navigator.serial.addEventListener('disconnect', function(){
      if (SERIAL.connected){ logC('err', 'USB device disconnected'); serialDisconnect(); }
    });
  }
  if (!SERIAL.supported){
    document.getElementById('serialNote').textContent =
      'Web Serial is not available in this browser — open this file in Chrome or Edge on desktop to connect to the machine. Everything else works here.';
  }

  document.getElementById('homeBtn').addEventListener('click', function(){ sendLine('$H'); });
  document.getElementById('unlockBtn').addEventListener('click', function(){ sendLine('$X'); });
  document.getElementById('resetBtn').addEventListener('click', function(){ sendRT(0x18, 'ctrl-x (soft reset)'); });

  document.getElementById('hdrHold').addEventListener('click', jobHold);
  document.getElementById('hdrResume').addEventListener('click', jobResume);
  document.getElementById('estopBtn').addEventListener('click', emergencyStop);
  document.getElementById('jogEstop').addEventListener('click', emergencyStop);
  document.getElementById('rbEstop').addEventListener('click', emergencyStop);
  document.getElementById('rbHold').addEventListener('click', jobHold);
  document.getElementById('rbResume').addEventListener('click', jobResume);
  document.getElementById('rbStop').addEventListener('click', jobStop);
  document.getElementById('rbDoor').addEventListener('click', function(){
    if (!SERIAL.connected) return;
    sendRT(0x84, 'safety-door pause (retract + spindle stop) \u2014 Resume restores');
  });
  document.getElementById('rbAdjust').addEventListener('click', function(){
    document.getElementById('ovRow').classList.toggle('on');
  });
  document.querySelectorAll('#ovRow button[data-ov]').forEach(function(b){
    b.addEventListener('click', function(){ sendOverride(b.dataset.ov); });
  });
  document.querySelectorAll('#ovRow button[data-zn]').forEach(function(b){
    b.addEventListener('click', function(){ znAdjust(parseFloat(b.dataset.zn)); });
  });
  document.getElementById('ovKeep').addEventListener('change', function(){ adjKeepSet(this.checked); });
  document.getElementById('jobRecover').addEventListener('click', function(){
    var el = document.getElementById('recLine');
    var ln = parseInt(el.value || el.placeholder, 10);
    if (!ln || ln < 1){ uiNote('Which line?', 'Scrub the preview to the resume point, or type a line number in the box.'); return; }
    jobStartFrom(ln);
  });
  document.getElementById('tcCapture').addEventListener('click', function(){
    if (!SERIAL.connected){ logC('err', 'connect first, jog to the tool-change spot, then capture'); return; }
    document.getElementById('tcX').value = SERIAL.mpos.x.toFixed(1);
    document.getElementById('tcY').value = SERIAL.mpos.y.toFixed(1);
    document.getElementById('tcEnable').checked = true;
    document.getElementById('tcPreset').value = 'custom';
    readUIToProfile(); tcAutoNote();
    logC('sys', 'tool-change position captured: ' + SERIAL.mpos.x.toFixed(1) + ', ' + SERIAL.mpos.y.toFixed(1));
  });
  document.getElementById('tcPreset').addEventListener('change', function(){
    readUIToProfile(); tcAutoNote();
    var sp = toolChangeSpot();
    if (sp) logC('sys', 'tool changes: ' + sp.name + ' (X' + sp.x.toFixed(1) + ' Y' + sp.y.toFixed(1) + ')');
  });
  document.getElementById('pkCapture').addEventListener('click', function(){
    if (!SERIAL.connected){ logC('err', 'connect first, jog to the end-of-job spot, then capture'); return; }
    document.getElementById('pkX').value = SERIAL.mpos.x.toFixed(1);
    document.getElementById('pkY').value = SERIAL.mpos.y.toFixed(1);
    document.getElementById('tcEndPark').checked = true;
    readUIToProfile();
    logC('sys', 'end-of-job park captured: ' + SERIAL.mpos.x.toFixed(1) + ', ' + SERIAL.mpos.y.toFixed(1));
  });

  document.getElementById('alarmHome').addEventListener('click', function(){ sendLine('$H'); });

  // ----- settings modal -----
  function settingsClose(){ document.getElementById('setModal').hidden = true; }
  document.getElementById('settingsBtn').addEventListener('click', function(){
    document.getElementById('setModal').hidden = false;
  });
  document.getElementById('setClose').addEventListener('click', settingsClose);
  document.getElementById('setModal').addEventListener('pointerdown', function(e){
    if (e.target === e.currentTarget) settingsClose();
  });
  document.querySelectorAll('#smTabs button[data-sm]').forEach(function(b){
    b.addEventListener('click', function(){
      document.querySelectorAll('#smTabs button').forEach(function(u){ u.classList.toggle('active', u === b); });
      document.querySelectorAll('.smPane').forEach(function(pn){ pn.classList.toggle('active', pn.id === b.dataset.sm); });
    });
  });
  window.addEventListener('keydown', function(e){
    if (e.code !== 'Escape') return;
    if (!document.getElementById('bzModal').hidden && !PROBE.active){
      e.stopImmediatePropagation(); bzCloseModal(); return;
    }
    if (!document.getElementById('setModal').hidden){
      e.stopImmediatePropagation(); settingsClose(); return;
    }
    if (!document.getElementById('qaModal').hidden){
      e.stopImmediatePropagation(); qaEditClose();
    }
  }, true);

  // ----- BitZero modal -----
  document.getElementById('bzOpen').addEventListener('click', bzOpenModal);
  document.getElementById('bzClose').addEventListener('click', bzCloseModal);
  document.getElementById('bzEstop').addEventListener('click', emergencyStop);
  document.getElementById('bzStart').addEventListener('click', bzStart);
  document.getElementById('cfgCheck').addEventListener('click', function(){ controllerCheckShow(false); });
  ['uiTheme','uiAccent','uiAccentHex'].forEach(function(id){
    document.getElementById(id).addEventListener('input', function(){
      readUIToProfile();
      document.getElementById('uiAccentHex').style.display = document.getElementById('uiAccent').value === 'custom' ? '' : 'none';
      applyTheme();
    });
  });
  themeLoad(); applyTheme(false);
  window.addEventListener('storage', function(e){         // 454 Design changed it
    if (e.key !== '454-theme') return;
    themeLoad(); applyTheme(false);
    if (!document.getElementById('setModal').hidden) applyProfileToUI();
  });
  document.getElementById('rbJog').addEventListener('click', jogModalOpen);
  document.getElementById('rbActions').addEventListener('click', function(e){
    e.stopPropagation();
    rbMenuOpen(document.getElementById('rbMenu').hidden);
  });
  window.addEventListener('pointerdown', function(e){          // click anywhere else closes it
    var m = document.getElementById('rbMenu');
    if (m.hidden) return;
    if (m.contains(e.target) || document.getElementById('rbActions').contains(e.target)) return;
    rbMenuOpen(false);
  }, true);
  rbMenuRender();
  document.getElementById('dlgOk').addEventListener('click', function(){ dlgEnd(true); });
  document.getElementById('dlgCancel').addEventListener('click', function(){ dlgEnd(false); });
  document.getElementById('dlgAlt').addEventListener('click', function(){ dlgEnd('alt'); });
  document.getElementById('dlgX').addEventListener('click', function(){ dlgEnd(false); });
  document.getElementById('dlgModal').addEventListener('pointerdown', function(e){ if (e.target.id === 'dlgModal') dlgEnd(false); });
  document.getElementById('dlgPanel').addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); dlgEnd(false); }
    else if (e.key === 'Enter'){ e.preventDefault(); dlgEnd(true); }
    e.stopPropagation();
  });
  document.getElementById('connGo').addEventListener('click', function(){ connClose(); serialConnect(false); });
  document.getElementById('connSkip').addEventListener('click', connClose);
  document.getElementById('connX').addEventListener('click', connClose);
  document.getElementById('connPanel').addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); connClose(); }
    e.stopPropagation();
  });
  setTimeout(function(){ if (SERIAL.supported) connAsk(); }, 400);   // after the app has drawn itself (a browser that can't connect is told why, below)
  document.getElementById('homeGo').addEventListener('click', homeNow);
  document.getElementById('homeSkip').addEventListener('click', homeClose);
  document.getElementById('homeX').addEventListener('click', homeClose);
  document.getElementById('homePanel').addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); homeClose(); }
    e.stopPropagation();
  });
  document.getElementById('qaAdd').addEventListener('click', function(){ qaEditOpen(null); });
  document.getElementById('qaCancel').addEventListener('click', function(){ qaFinish(false, 'cancelled'); });
  document.getElementById('qaClose').addEventListener('click', qaEditClose);
  document.getElementById('qaCancelEdit').addEventListener('click', qaEditClose);
  document.getElementById('qaSave').addEventListener('click', qaSave);
  document.getElementById('qaDelete').addEventListener('click', qaDelete);
  document.getElementById('qaCode').addEventListener('input', qaCheck);
  document.getElementById('qaPanel').addEventListener('keydown', function(e){
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); qaSave(); }
  });
  qaRender();
  document.getElementById('bzModal').addEventListener('pointerdown', function(e){
    if (e.target === e.currentTarget && !PROBE.active) bzCloseModal();
  });

  // ----- jog modal -----
  document.getElementById('jogOpen').addEventListener('click', jogModalOpen);
  document.getElementById('jogClose').addEventListener('click', jogModalClose);
  document.getElementById('jogModal').addEventListener('pointerdown', function(e){
    if (e.target === e.currentTarget) jogModalClose();
  });
  window.addEventListener('keydown', jogKeyDown, true);
  window.addEventListener('keyup', jogKeyUp, true);
  window.addEventListener('blur', function(){
    if (KEYJOG.code || JOGC.active){ KEYJOG.code = null; jogFastStop(true); }
  });

  document.querySelectorAll('#jogIncRow button[data-inc]').forEach(function(b){
    b.addEventListener('click', function(){
      PROFILE.jog.inc = b.dataset.inc;
      setIncUI(b.dataset.inc);
      profileSave();
    });
  });
  document.querySelectorAll('#jogGrid button[data-jog]').forEach(function(b){
    var p = b.dataset.jog.split(',').map(Number);
    b.addEventListener('pointerdown', function(e){
      if (PROFILE.jog.inc !== 'fast') return;
      e.preventDefault();
      if (!requireIdle('jog')) return;
      b.setPointerCapture(e.pointerId);
      jogFastStart(p);
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(function(ev){
      b.addEventListener(ev, function(){ if (PROFILE.jog.inc === 'fast') jogFastStop(true); });
    });
    b.addEventListener('click', function(){
      if (PROFILE.jog.inc === 'fast') return; // handled by hold
      if (!requireIdle('jog')) return;
      jogStepOnce(p);
    });
  });

  document.getElementById('zeroX').addEventListener('click', function(){ if (requireIdle('zeroing')) sendLine('G10 L20 P0 X0'); });
  document.getElementById('zeroY').addEventListener('click', function(){ if (requireIdle('zeroing')) sendLine('G10 L20 P0 Y0'); });
  document.getElementById('zeroZ').addEventListener('click', zeroZNow);
  document.getElementById('zeroAll').addEventListener('click', function(){ if (requireIdle('zeroing')){ clearToolOffset(); sendLine('G10 L20 P0 X0 Y0 Z0'); markToolZeroed(); bsAfterZero(); } });
  document.getElementById('jogZ6').addEventListener('click', jogLiftZ6);
  document.getElementById('gotoZero').addEventListener('click', function(){
    if (!requireIdle('go to zero')) return;
    sendLine(zHighCmd(travelZ())); // retract near top of travel (requires homing)
    sendLine('G90 G0 X0 Y0');
  });
  document.querySelectorAll('#rapidGrid button[data-rp]').forEach(function(b){
    b.addEventListener('click', function(){
      var f = b.dataset.rp.split(',').map(Number);
      rapidTo(f[0], f[1]);
    });
  });
  document.getElementById('jogProbe').addEventListener('click', function(){
    jogModalClose();   // releases keyboard jog cleanly
    bzOpenModal();
  });

  document.getElementById('spinOn').addEventListener('click', function(){
    if (!requireIdle('spindle start')) return;
    if (SERIAL.state !== 'Idle'){ logC('err', 'spindle start blocked — machine is ' + SERIAL.state); return; }
    var rpm = parseInt(document.getElementById('rpmIn').value, 10) || 10000;
    sendLine('M3 S' + rpm);
  });
  document.getElementById('spinOff').addEventListener('click', function(){ sendLine('M5'); });
  document.getElementById('hdrSpindle').addEventListener('click', function(){
    if (SERIAL.connected && SERIAL.speed > 0) sendLine('M5'); // stop only — starting stays a deliberate act
  });

  document.getElementById('jobRun').addEventListener('click', jobStart);
  document.getElementById('jobHold').addEventListener('click', jobHold);
  document.getElementById('jobResume').addEventListener('click', jobResume);
  document.getElementById('jobStop').addEventListener('click', jobStop);
  document.getElementById('toolJog').addEventListener('click', toolJogNow);
  document.getElementById('toolBz').addEventListener('click', toolBzNow);
  document.getElementById('toolStop').addEventListener('click', function(){
    document.getElementById('toolModal').hidden = true;
    jobStop();
  });
  document.getElementById('toolContinue').addEventListener('click', toolContinueNow);

  document.getElementById('consoleIn').addEventListener('keydown', function(e){
    if (e.key !== 'Enter') return;
    var v = e.target.value.trim();
    if (!v) return;
    e.target.value = '';
    if (v === '?') sendRT(0x3f, '?');
    else if (v === '!') jobHold();
    else if (v === '~') jobResume();
    else sendLine(v);
  });
  document.getElementById('verboseChk').addEventListener('change', function(e){
    SERIAL.verbose = e.target.checked;
  });

  // ----- profile wiring -----
  profileLoad();
  applyProfileToUI();
  ['bsEnable','bsX','bsY','bzEnable','bzVersion','bzThk','spinType','spinupSec','jogFeedXY','jogFeedZ','highStart','uiTheme','uiAccent','uiAccentHex','travelZIn','topZIn','tcEnable','tcPreset','tcEndPark','tcX','tcY','pkX','pkY',
   'envW','envD','originSel','stockThk','rapidRate','checkEnvelope','showEnvelope'].forEach(function(id){
    document.getElementById(id).addEventListener('change', readUIToProfile);
  });
  document.getElementById('machinePreset').addEventListener('change', readUIToProfile);

  document.getElementById('bsTest').addEventListener('click', bsTest);
  document.getElementById('bsCapture').addEventListener('click', function(){
    if (!SERIAL.connected){ logC('err', 'connect first, jog over the BitSetter button, then capture'); return; }
    document.getElementById('bsX').value = SERIAL.mpos.x.toFixed(1);
    document.getElementById('bsY').value = SERIAL.mpos.y.toFixed(1);
    document.getElementById('bsEnable').checked = true;
    readUIToProfile();
    logC('sys', 'BitSetter position captured: ' + SERIAL.mpos.x.toFixed(1) + ', ' + SERIAL.mpos.y.toFixed(1) + ' (machine coords)');
  });

  document.getElementById('profExport').addEventListener('click', function(){
    readUIToProfile();
    var blob = new Blob([JSON.stringify(PROFILE, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '454-control-profile.json';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
  });
  document.getElementById('profImport').addEventListener('click', function(){
    document.getElementById('profFile').click();
  });
  document.getElementById('profFile').addEventListener('change', function(e){
    var f = e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function(){
      try{ importProfileJSON(JSON.parse(rd.result)); }
      catch(err){ logC('err', 'could not parse ' + f.name + ': ' + err.message); }
    };
    rd.readAsText(f);
    e.target.value = '';
  });

  document.getElementById('spinType').addEventListener('change', function(e){
    PROFILE.spindle.typeUser = true;                     // chosen by you: connecting won't change it
    applySpindleRange();
    if (e.target.value === 'vfd' && (parseFloat(document.getElementById('spinupSec').value) || 0) < 7){
      document.getElementById('spinupSec').value = 7;
      readUIToProfile();
      logC('sys', 'spin-up dwell raised to 7 s for the VFD spindle \u2014 adjust in Settings \u2192 Machine if yours settles faster');
    }
  });

  document.getElementById('refreshCfg').addEventListener('click', function(){
    SERIAL.queried = false;
    SERIAL.settings = {}; SERIAL.offsets = {}; SERIAL.buildInfo = '';
    doQuery();
  });
}

document.addEventListener('DOMContentLoaded', function(){
  wire();
  wireMachine();
  document.getElementById('verChip').textContent = 'v' + CONTROL_VERSION;
  document.getElementById('brandEl').title = '454 Control v' + CONTROL_VERSION;
  document.getElementById('verSub').textContent = 'G-code sender for Shapeoko & Nomad \u2014 v' + CONTROL_VERSION;
  document.title = '454 Control v' + CONTROL_VERSION;
  handoffStart();                                        // jobs from 454 Design's "Preview in 454 Control"
});
