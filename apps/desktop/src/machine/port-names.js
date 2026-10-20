// What to call each serial port in the "Choose the machine's port" list, and which is likely the machine.
// The operating system says what's plugged in: on Linux, a USB port's id names its maker and product
// (/dev/serial/by-id/usb-Carbide3D_Shapeoko_…-if00, the name lsusb shows); on Windows, the device's own name
// ("USB Serial Device (COM3)") and its maker. A port with no USB details is one built into the computer
// (Linux lists /dev/ttyS0 to ttyS31 on most PCs): never the machine, so it's listed only on request.
'use strict';

// Words in a port's name or maker that mean a CNC controller (the Shapeoko's and Nomad's boards are Carbide 3D's)
const MACHINE = /shapeoko|carbide|nomad/i;

// A person's name for the port: the product from its id, else the device's name or maker, else its path
function portName(p) {
  const id = p.pnpId || '';
  // Linux: usb-<maker>_<product>_<serial>-if00 (or -port0); spaces in names are underscores
  const m = /^usb-(.+?)(?:-if\d+.*|-port\d+)?$/.exec(id);
  if (m) {
    let s = m[1];
    if (p.serialNumber && s.endsWith('_' + p.serialNumber)) s = s.slice(0, -p.serialNumber.length - 1);
    s = s.replace(/_+/g, ' ').trim();
    if (s) return s;
  }
  // Windows: "USB Serial Device (COM3)": the name without the COM port, which is shown beside it anyway
  const fn = (p.friendlyName || '').replace(/\s*\((COM\d+)\)\s*$/i, '').trim();
  if (fn && p.manufacturer && !/^microsoft$/i.test(p.manufacturer) && fn.toLowerCase().indexOf(p.manufacturer.toLowerCase()) < 0) return p.manufacturer + ' ' + fn;
  if (fn) return fn;
  return p.manufacturer || '';
}

// Each port with its name, whether it's USB, and whether it looks like the machine; the likely ones first,
// then the other USB ones, then the rest, each in the order the computer gave them
function describePorts(ports) {
  const out = ports.map((p, i) => {
    const name = portName(p);
    // USB by its details, or by its Linux name (ttyACM, ttyUSB) where the details couldn't be read
    const usb = p.vendorId != null || /^usb-/.test(p.pnpId || '') || /\/tty(ACM|USB)\d+$/.test(p.path || '') || p.manufacturer === 'test port';
    return Object.assign({}, p, { name, usb, likely: usb && MACHINE.test(name + ' ' + (p.manufacturer || '')), order: i });
  });
  const rank = (p) => (p.likely ? 0 : p.usb ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || a.order - b.order).map((p) => { delete p.order; return p; });
}

module.exports = { portName, describePorts, MACHINE };
