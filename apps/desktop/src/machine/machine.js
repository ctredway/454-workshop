// The machine process: owns the serial port, so nothing the window does (redrawing, calculating
// toolpaths) can delay the machine. Runs as an Electron utility process; talks to the window over a
// direct message channel handed over by the main process.
'use strict';
const serial = require('./serial.js');

let win = null;                   // the window's end of the channel
const conn = new serial.Connection();
let stopWatching = null;

function send(msg) { if (win) win.postMessage(msg); }
function reply(id, ok, extra) { send(Object.assign({ id, ok }, extra || {})); }

async function handle(m) {
  try {
    if (m.type === 'list') { reply(m.id, true, { ports: await serial.list() }); }
    else if (m.type === 'open') {
      await conn.open(m.path, m.baudRate || 115200,
        (data) => send({ type: 'data', data }),
        (error) => send({ type: 'closed', error }));
      reply(m.id, true);
    }
    else if (m.type === 'write') { await conn.write(m.data); reply(m.id, true); }
    else if (m.type === 'close') { await conn.close(); reply(m.id, true); }
    else reply(m.id, false, { error: 'unknown request ' + m.type });
  } catch (e) { reply(m.id, false, { error: e.message }); }
}

process.parentPort.on('message', (e) => {
  if (e.data && e.data.type === 'window' && e.ports && e.ports[0]) {
    win = e.ports[0];                                  // a new or reloaded window
    win.on('message', (ev) => handle(ev.data));
    win.start();
    if (stopWatching) stopWatching();
    stopWatching = serial.watch((ports) => send({ type: 'ports', ports }));
  }
});
