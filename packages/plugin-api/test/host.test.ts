import { describe, it, expect } from 'vitest';
import { Host, normaliseKey, PluginError, type Plugin, type MachineAccess } from '../src/index.js';

const cmd = (id: string, run: () => void = () => {}) => ({ id, title: id, run });

function sketch(): Plugin {
  return {
    manifest: { id: '454.design', name: 'Design', version: '1.0.0', apiVersion: 1, trusted: true },
    contributes: {
      commands: [cmd('sketch.fillet'), cmd('sketch.mirror'), cmd('view.fit')],
      keybindings: [
        { key: 'F', command: 'sketch.fillet' },
        { key: 'Shift+M', command: 'sketch.mirror' },
        { key: 'Home', command: 'view.fit' },
      ],
      fileHandlers: [{ id: 'crv', extensions: ['.crv'], description: 'VCarve project', open: async () => {} }],
    },
  };
}

describe('shortcuts', () => {
  it('treats different spellings of a key as the same key', () => {
    expect(normaliseKey('shift+m')).toBe('Shift+M');
    expect(normaliseKey('M+Shift')).toBe('Shift+M');
    expect(normaliseKey('ctrl+shift+z')).toBe('Ctrl+Shift+Z');
    expect(normaliseKey('home')).toBe('Home');
  });

  it('refuses a plugin that claims a key already taken, naming both', () => {
    const host = new Host();
    host.register(sketch());
    const greedy: Plugin = {
      manifest: { id: 'x.fit', name: 'Fit helper', version: '1', apiVersion: 1 },
      contributes: { commands: [cmd('x.fitall')], keybindings: [{ key: 'f', command: 'x.fitall' }] },
    };
    expect(() => host.register(greedy)).toThrow(/F is already "sketch.fillet" from 454.design/);
  });

  it('refuses a plugin whose own shortcuts clash with each other', () => {
    const host = new Host();
    const self: Plugin = {
      manifest: { id: 'x.dup', name: 'Dup', version: '1', apiVersion: 1 },
      contributes: {
        commands: [cmd('a'), cmd('b')],
        keybindings: [{ key: 'Q', command: 'a' }, { key: 'q', command: 'b' }],
      },
    };
    expect(() => host.register(self)).toThrow(PluginError);
  });

  it('allows the same key in different modes, and the mode wins while it is on', () => {
    const host = new Host();
    host.register(sketch());
    host.register({
      manifest: { id: '454.control', name: 'Control', version: '1', apiVersion: 1, trusted: true },
      contributes: { commands: [cmd('machine.feedhold')], keybindings: [{ key: 'F', command: 'machine.feedhold', when: 'machine' }] },
    });
    expect(host.commandForKey('f')).toBe('sketch.fillet');
    expect(host.commandForKey('f', 'machine')).toBe('machine.feedhold');
  });

  it('refuses a shortcut bound to a command that does not exist', () => {
    const host = new Host();
    expect(() => host.register({
      manifest: { id: 'x.bad', name: 'Bad', version: '1', apiVersion: 1 },
      contributes: { keybindings: [{ key: 'Z', command: 'nope' }] },
    })).toThrow(/doesn't exist/);
  });
});

describe('registration', () => {
  it('is all or nothing: a refused plugin leaves nothing behind', () => {
    const host = new Host();
    host.register(sketch());
    const partlyBad: Plugin = {
      manifest: { id: 'x.half', name: 'Half', version: '1', apiVersion: 1 },
      contributes: {
        commands: [cmd('x.fine')],
        keybindings: [{ key: 'W', command: 'x.fine' }, { key: 'Home', command: 'x.fine' }],  // Home is taken
      },
    };
    expect(() => host.register(partlyBad)).toThrow();
    expect(host.listCommands().map((c) => c.id)).not.toContain('x.fine');
    expect(host.commandForKey('W')).toBeUndefined();
  });

  it('refuses a plugin written for a newer 454', () => {
    const host = new Host();
    expect(() => host.register({ manifest: { id: 'x.new', name: 'New', version: '1', apiVersion: 99 } }))
      .toThrow(/needs a newer 454/);
  });

  it('refuses a plugin whose requirements are missing', () => {
    const host = new Host();
    expect(() => host.register({ manifest: { id: '454.cam', name: 'CAM', version: '1', apiVersion: 1, requires: ['454.design'] } }))
      .toThrow(/needs "454.design"/);
  });

  it('gives each file type one owner', () => {
    const host = new Host();
    host.register(sketch());
    expect(host.handlerFor('R1Wingbutton.CRV')?.id).toBe('crv');
    expect(() => host.register({
      manifest: { id: 'x.crv', name: 'Other', version: '1', apiVersion: 1 },
      contributes: { fileHandlers: [{ id: 'c2', extensions: ['.crv'], description: '', open: async () => {} }] },
    })).toThrow(/\.crv files are already opened by 454.design/);
  });
});

describe('the machine', () => {
  const machine: MachineAccess = { runJob: async () => {}, endJob: async () => {} };

  it('is offered to trusted plugins only', async () => {
    const host = new Host({ machine });
    let seenTrusted: unknown = 'unset', seenOther: unknown = 'unset';
    host.register({ manifest: { id: '454.control', name: 'Control', version: '1', apiVersion: 1, trusted: true },
                    activate: (h) => { seenTrusted = h.machine; } });
    host.register({ manifest: { id: 'acme.gadget', name: 'Gadget', version: '1', apiVersion: 1 },
                    activate: (h) => { seenOther = h.machine; } });
    await host.activate('454.control');
    await host.activate('acme.gadget');
    expect(seenTrusted).toBe(machine);
    expect(seenOther).toBeUndefined();
  });
});

describe('settings and commands', () => {
  it('keeps each plugin\'s settings apart', () => {
    const host = new Host();
    const a: Plugin = { manifest: { id: 'a', name: 'A', version: '1', apiVersion: 1 } };
    const b: Plugin = { manifest: { id: 'b', name: 'B', version: '1', apiVersion: 1 } };
    host.register(a); host.register(b);
    host.servicesFor(a).settings.set('units', 'in');
    expect(host.servicesFor(a).settings.get('units', 'mm')).toBe('in');
    expect(host.servicesFor(b).settings.get('units', 'mm')).toBe('mm');
  });

  it('runs commands, and skips ones that say they are disabled', async () => {
    const host = new Host();
    let ran = 0;
    host.register({
      manifest: { id: 'a', name: 'A', version: '1', apiVersion: 1 },
      contributes: { commands: [{ id: 'go', title: 'Go', run: () => { ran++; } },
                                { id: 'no', title: 'No', run: () => { ran += 100; }, enabled: () => false }] },
    });
    await host.run('go'); await host.run('no');
    expect(ran).toBe(1);
  });

  it('keeps delivering events when one listener fails', () => {
    const host = new Host();
    let got = 0;
    host.events.on('x', () => { throw new Error('bad listener'); });
    host.events.on('x', () => { got++; });
    const err = console.error; console.error = () => {};
    host.events.emit('x');
    console.error = err;
    expect(got).toBe(1);
  });
});
