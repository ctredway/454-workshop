// The port chooser's names and order (src/machine/port-names.js): the machine first, by the name the operating
// system gives it, and the ports built into the computer out of the way. Clint, 2026-10-20, on Linux Mint: "I
// cannot tell what device is the cnc machine, but lsusb shows it with Shapeoko in the name."
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { portName, describePorts } = require('../src/machine/port-names.js');

// Linux Mint on a PC: 32 built-in ports with nothing known about them, and the machine on USB
const builtIn = Array.from({ length: 32 }, (_, i) => ({ path: '/dev/ttyS' + i, vendorId: null, manufacturer: '', pnpId: '' }));
const shapeoko = { path: '/dev/ttyACM0', vendorId: 0x2341, productId: 0x0043, manufacturer: 'Carbide3D', serialNumber: '75834353930351F0D0B1',
  pnpId: 'usb-Carbide3D_Shapeoko_75834353930351F0D0B1-if00' };

describe('naming a port', () => {
  it('Linux: the maker and product from its USB id, without the serial number or interface', () => {
    expect(portName(shapeoko)).toBe('Carbide3D Shapeoko');
    expect(portName({ pnpId: 'usb-1a86_USB2.0-Serial-if00-port0' })).toBe('1a86 USB2.0-Serial');
    expect(portName({ pnpId: 'usb-Arduino__www.arduino.cc__0043_8573332373935141F0B1-if00', serialNumber: '8573332373935141F0B1' })).toBe('Arduino www.arduino.cc 0043');
  });
  it('Windows: the device’s own name, without the COM port (shown beside it), with its maker unless that’s Microsoft', () => {
    expect(portName({ path: 'COM3', friendlyName: 'USB Serial Device (COM3)', manufacturer: 'Microsoft' })).toBe('USB Serial Device');
    expect(portName({ path: 'COM4', friendlyName: 'Arduino Uno (COM4)', manufacturer: 'Arduino LLC (www.arduino.cc)' })).toBe('Arduino LLC (www.arduino.cc) Arduino Uno');
    expect(portName({ path: 'COM5', friendlyName: 'Carbide Motion (COM5)', manufacturer: 'Carbide' })).toBe('Carbide Motion');
  });
  it('nothing known: no name (the chooser shows the path)', () => {
    expect(portName({ path: '/dev/ttyS0' })).toBe('');
  });
});

describe('the order, and which is the machine', () => {
  it('the Shapeoko first and marked, the built-in ports last and not USB', () => {
    const d = describePorts(builtIn.concat([shapeoko]));
    expect(d[0].path).toBe('/dev/ttyACM0');
    expect([d[0].name, d[0].usb, d[0].likely]).toEqual(['Carbide3D Shapeoko', true, true]);
    expect(d.slice(1).every((p) => p.usb === false && !p.likely)).toBe(true);
    expect(d).toHaveLength(33);
  });
  it('another USB device (a 3D printer, an Arduino) comes after the machine, before the built-in ports, and isn’t marked', () => {
    const printer = { path: '/dev/ttyUSB0', vendorId: 0x1a86, pnpId: 'usb-1a86_USB2.0-Serial-if00-port0', manufacturer: '1a86' };
    const d = describePorts([builtIn[0], printer, shapeoko]);
    expect(d.map((p) => p.path)).toEqual(['/dev/ttyACM0', '/dev/ttyUSB0', '/dev/ttyS0']);
    expect(d.map((p) => p.likely)).toEqual([true, false, false]);
  });
  it('Linux without udev’s details: ttyACM and ttyUSB are still USB, so they aren’t hidden', () => {
    const d = describePorts([{ path: '/dev/ttyS0' }, { path: '/dev/ttyACM0' }]);
    expect(d.map((p) => [p.path, p.usb])).toEqual([['/dev/ttyACM0', true], ['/dev/ttyS0', false]]);
  });
  it('a Nomad, or a port whose maker is Carbide, is marked too; the order of the rest is the computer’s', () => {
    const d = describePorts([{ path: 'COM1', vendorId: 0x0403, friendlyName: 'USB Serial Port (COM1)', manufacturer: 'FTDI' },
      { path: 'COM7', vendorId: 0x2341, friendlyName: 'USB Serial Device (COM7)', manufacturer: 'Carbide 3D' },
      { path: 'COM2', vendorId: 0x0403, friendlyName: 'USB Serial Port (COM2)', manufacturer: 'FTDI' }]);
    expect(d.map((p) => [p.path, p.likely])).toEqual([['COM7', true], ['COM1', false], ['COM2', false]]);
    expect(describePorts([{ path: '/dev/ttyACM1', pnpId: 'usb-Carbide3D_Nomad_3-if00' }])[0].likely).toBe(true);
  });
});
