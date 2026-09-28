/* ---------------- emergency stop ----------------
   Immediate soft reset (real-time 0x18: bypasses all buffers). Motion halts
   mid-step, spindle PWM drops now. Position is untrusted afterward — GRBL
   alarms if it was moving — so homedSeen clears and re-homing is required.
   Deliberately NO confirmation dialog. */
function emergencyStop(){
  if (!SERIAL.connected) return;
  recoveryNote('emergency stop');
  sendRT(0x18, 'ctrl-x (EMERGENCY STOP)');
  PROBE.active = false; PROBE.onDone = null;
  JOB.active = false; JOB.held = false; JOB.toolWait = null; JOB.inflight = [];
  if (QA.active) qaFinish(false, 'emergency stop');
  maybeToolPrompt();
  jogFastStop(false);
  KEYJOG.code = null;
  jogModalClose();
  bzCloseModal();
  SERIAL.homedSeen = false;
  updateJobUI('EMERGENCY STOP — machine reset. Re-home before any further motion.');
  logC('err', 'EMERGENCY STOP — soft reset sent. Spindle off, motion halted. Home the machine before continuing; work zero survives, machine position does not.');
}

