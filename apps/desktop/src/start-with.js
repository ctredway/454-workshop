// Which app opens when 454 Workshop starts, chosen on each computer (Window → Open at start). Clint, 2026-10-23: Design
// on the laptop, Control on the one in the garage. Kept in the app's data folder (start-with.json), so each computer
// has its own; Design, as before, until one is chosen.
const APPS = ['design', 'control'];
function createStartWith({ file, fs }) {
  let app = 'design';
  try { const s = JSON.parse(fs.readFileSync(file, 'utf8')); if (APPS.includes(s.app)) app = s.app; } catch (e) { /* not chosen yet */ }
  return {
    get app() { return app; },
    set(v) {
      if (!APPS.includes(v)) return false;
      app = v;
      try { fs.writeFileSync(file, JSON.stringify({ app }, null, 2)); return true; } catch (e) { return false; }
    },
  };
}
module.exports = { createStartWith };
