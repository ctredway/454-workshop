// The serial port, for the machine process. Plain Node, so it can be tested without Electron.
'use strict';
const { SerialPort } = require('serialport');
const fs = require('fs');

/** Ports that could be a controller. Uses the OS's device list, with a fallback for Linux systems
 *  without udev tools. Extra paths can be added with P454_SERIAL_PORTS (colon-separated), for testing. */
async function list() {
  let ports = [];
  try { ports = await SerialPort.list(); }
  catch (e) {
    if (process.platform === 'linux') {
      try { ports = fs.readdirSync('/dev').filter((n) => /^tty(ACM|USB)\d+$/.test(n)).map((n) => ({ path: '/dev/' + n })); } catch (e2) { ports = []; }
    }
  }
  const extra = (process.env.P454_SERIAL_PORTS || '').split(':').filter(Boolean).map((p) => ({ path: p, manufacturer: 'test port' }));
  return ports.concat(extra).map((p) => ({
    path: p.path,
    vendorId: p.vendorId ? parseInt(p.vendorId, 16) : null,
    productId: p.productId ? parseInt(p.productId, 16) : null,
    manufacturer: p.manufacturer || '',
    serialNumber: p.serialNumber || '',
  }));
}

/** Turn the OS's error into what to do about it. */
function explain(err, path) {
  const m = String((err && err.message) || err);
  if (/EACCES|Permission denied/i.test(m) && process.platform === 'linux')
    return `Permission denied opening ${path}. On Linux, your user needs to be in the dialout group: run  sudo usermod -a -G dialout $USER  then log out and back in.`;
  if (/EBUSY|busy|Access denied/i.test(m))
    return `${path} is in use by another program. Close Carbide Motion, a terminal, or another 454 window, then try again.`;
  if (/ENOENT|No such file|File not found/i.test(m))
    return `${path} isn't there any more. Check the USB cable, then choose the port again.`;
  return m;
}

class Connection {
  constructor() { this.port = null; }
  /** Open at `baudRate`; onData gets each chunk received, onClose(error|null) when it closes. */
  open(path, baudRate, onData, onClose) {
    return new Promise((resolve, reject) => {
      if (this.port) { reject(new Error('A port is already open.')); return; }
      const port = new SerialPort({ path, baudRate, autoOpen: false });
      port.open((err) => {
        if (err) { reject(new Error(explain(err, path))); return; }
        this.port = port; this.path = path;
        let closedByUs = false;
        this._markClosing = () => { closedByUs = true; };
        port.on('data', (buf) => onData(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)));
        port.on('close', (e) => { this.port = null; onClose(closedByUs ? null : explain(e || 'The port closed unexpectedly (was the cable unplugged?)', path)); });
        port.on('error', () => {});                     // reported through 'close'
        resolve();
      });
    });
  }
  /** Resolves once the bytes have been handed to the OS. */
  write(data) {
    return new Promise((resolve, reject) => {
      if (!this.port) { reject(new Error('The port is not open.')); return; }
      this.port.write(Buffer.from(data), (err) => {
        if (err) { reject(new Error(explain(err, this.path))); return; }
        this.port.drain((e2) => (e2 ? reject(new Error(explain(e2, this.path))) : resolve()));
      });
    });
  }
  close() {
    return new Promise((resolve) => {
      if (!this.port) { resolve(); return; }
      this._markClosing();
      this.port.close(() => resolve());
    });
  }
}

/** Call onChange(ports) whenever the set of ports changes (plugging in or out). */
function watch(onChange, everyMs = 1000) {
  let last = '';
  const tick = async () => {
    const ports = await list();
    const key = ports.map((p) => p.path).sort().join('|');
    if (key !== last) { last = key; onChange(ports); }
  };
  tick();
  const t = setInterval(tick, everyMs);
  return () => clearInterval(t);
}

module.exports = { list, Connection, watch, explain };
