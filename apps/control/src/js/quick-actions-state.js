/* ============================================================
   QUICK ACTIONS: saved G-code for things done often.
   Lines go one at a time: each waits for the controller's "ok" before the
   next is sent, so a multi-line action can never overflow GRBL's small
   input buffer. Any error, alarm, reset or E-stop ends the action.
   ============================================================ */
var QA = {active:false, name:'', lines:[], i:0};
