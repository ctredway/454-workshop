// Runs inside Design in the desktop app: make a toolpath, press "Preview in 454 Control".
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await new Promise((ok) => (function p(){ if (typeof tpPreview === 'function' && camReady()) ok(); else setTimeout(p, 100); })());
    DOC.stock = Object.assign({}, DOC.stock, { w: 160, h: 100, t: 12, zero: 'top' });
    DOC.ents = [{ t: 'rect', x: 20, y: 15, w: 120, h: 70 }]; DOC.toolpaths = []; DOC.name = 'preview-test';
    SEL = [0]; cutOpen(null); await wait(150);
    const set = (id, v, ev) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); };
    set('cutType', 'outside', 'change'); await wait(150);
    CUT.toolChosen = true; CUT.dia = 6.35; set('cutDia', 6.35);
    const th = document.getElementById('cutThrough'); if (!th.checked) th.click();
    await wait(150); CUT.toolChosen = true; cutApply(); await wait(400);
    renderToolpathPanel(); await wait(200);
    const expected = tpJob().gc.split('\n').length;
    Array.from(document.querySelectorAll('#tpPanel button')).find((b) => /Preview in 454 Control/.test(b.textContent)).click();
    await wait(4500);
    return { ok: true, expectedLines: expected, toast: MSG_LOG[0] ? MSG_LOG[0].title + ': ' + MSG_LOG[0].detail : '',
             storageTaken: localStorage.getItem('454.handoff') === null };
  } catch (e) { return { ok: false, error: String(e.stack || e) }; }
})()
