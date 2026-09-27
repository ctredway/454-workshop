import {
  API_VERSION, PluginError,
  type Command, type Events, type FileHandler, type HelpTopic, type HostServices, type Keybinding,
  type MachineAccess, type PanelContribution, type Plugin,
} from './index.js';

/** Make "shift+m", "M+Shift" and "Shift+M" the same key. */
export function normaliseKey(key: string): string {
  const parts = key.split('+').map((p) => p.trim()).filter(Boolean);
  const mods = ['Ctrl', 'Alt', 'Shift', 'Meta'];
  const found = new Set<string>();
  let main = '';
  for (const p of parts) {
    const m = mods.find((x) => x.toLowerCase() === p.toLowerCase());
    if (m) found.add(m);
    else main = p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
  }
  if (!main) throw new Error(`"${key}" has no key, only modifiers`);
  return [...mods.filter((m) => found.has(m)), main].join('+');
}

class SimpleEvents implements Events {
  private handlers = new Map<string, Set<(p?: unknown) => void>>();
  on(event: string, fn: (p?: unknown) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    return () => this.handlers.get(event)?.delete(fn);
  }
  emit(event: string, payload?: unknown): void {
    this.handlers.get(event)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`handler for "${event}" failed`, e); }   // one bad listener mustn't stop the rest
    });
  }
}

interface Registered<T> { owner: string; item: T; }

export interface HostOptions {
  /** The machine service. Handed only to trusted plugins. */
  machine?: MachineAccess;
  /** Where settings are stored. Defaults to memory. */
  store?: { get(k: string): unknown; set(k: string, v: unknown): void };
}

/**
 * The plugin host: loads plugins, keeps a registry of what they contribute, and enforces the
 * rules. Registration is all-or-nothing: if any part of a plugin is refused, none of it is
 * registered, so a half-loaded plugin can't leave the app in an odd state.
 */
export class Host {
  readonly events: Events = new SimpleEvents();
  private plugins = new Map<string, Plugin>();
  private active = new Set<string>();
  private commands = new Map<string, Registered<Command>>();
  private keys = new Map<string, Registered<Keybinding>>();   // key + mode -> binding
  private panels = new Map<string, Registered<PanelContribution>>();
  private files = new Map<string, Registered<FileHandler>>();  // extension -> handler
  private help = new Map<string, Registered<HelpTopic>>();
  private memory = new Map<string, unknown>();

  constructor(private opts: HostOptions = {}) {}

  /** Add a plugin and everything it contributes, or refuse it entirely with a reason. */
  register(plugin: Plugin): void {
    const m = plugin.manifest;
    if (!m || !m.id) throw new PluginError('a plugin has no id', '?');
    if (this.plugins.has(m.id)) throw new PluginError(`"${m.id}" is already loaded`, m.id);
    if (m.apiVersion > API_VERSION)
      throw new PluginError(`"${m.name}" needs a newer 454 (plugin API ${m.apiVersion}; this is ${API_VERSION})`, m.id);
    for (const dep of m.requires ?? [])
      if (!this.plugins.has(dep)) throw new PluginError(`"${m.name}" needs "${dep}", which isn't loaded`, m.id);

    const c = plugin.contributes ?? {};
    // check everything first, then register: all or nothing
    const cmdIds = new Set<string>();
    for (const cmd of c.commands ?? []) {
      if (this.commands.has(cmd.id) || cmdIds.has(cmd.id))
        throw new PluginError(`command "${cmd.id}" is already defined${this.ownerOf(this.commands, cmd.id)}`, m.id);
      cmdIds.add(cmd.id);
    }
    const newKeys = new Map<string, Keybinding>();
    for (const kb of c.keybindings ?? []) {
      const key = normaliseKey(kb.key);
      const slot = key + '|' + (kb.when ?? '');
      const clash = this.keys.get(slot) ?? (newKeys.has(slot) ? {owner: m.id, item: newKeys.get(slot)!} : undefined);
      if (clash)
        throw new PluginError(
          `${key}${kb.when ? ` (in ${kb.when})` : ''} is already "${clash.item.command}" from ${clash.owner}; ` +
          `"${m.name}" can't also use it for "${kb.command}"`, m.id);
      if (!cmdIds.has(kb.command) && !this.commands.has(kb.command))
        throw new PluginError(`${key} is bound to "${kb.command}", which doesn't exist`, m.id);
      newKeys.set(slot, {...kb, key});
    }
    const exts = new Set<string>();
    for (const fh of c.fileHandlers ?? [])
      for (const ext of fh.extensions) {
        const e = ext.toLowerCase();
        if (this.files.has(e) || exts.has(e))
          throw new PluginError(`${e} files are already opened by ${this.files.get(e)?.owner ?? m.id}`, m.id);
        exts.add(e);
      }
    for (const p of c.panels ?? []) if (this.panels.has(p.id)) throw new PluginError(`panel "${p.id}" already exists`, m.id);
    for (const h of c.help ?? []) if (this.help.has(h.id)) throw new PluginError(`help topic "${h.id}" already exists`, m.id);

    // all clear
    this.plugins.set(m.id, plugin);
    (c.commands ?? []).forEach((cmd) => this.commands.set(cmd.id, {owner: m.id, item: cmd}));
    newKeys.forEach((kb, slot) => this.keys.set(slot, {owner: m.id, item: kb}));
    (c.fileHandlers ?? []).forEach((fh) => fh.extensions.forEach((e) => this.files.set(e.toLowerCase(), {owner: m.id, item: fh})));
    (c.panels ?? []).forEach((p) => this.panels.set(p.id, {owner: m.id, item: p}));
    (c.help ?? []).forEach((h) => this.help.set(h.id, {owner: m.id, item: h}));
    this.events.emit('plugin:registered', m.id);
  }

  /** Start a registered plugin, handing it the services it's entitled to. */
  async activate(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new PluginError(`"${id}" isn't loaded`, id);
    if (this.active.has(id)) return;
    await plugin.activate?.(this.servicesFor(plugin));
    this.active.add(id);
    this.events.emit('plugin:activated', id);
  }

  /** The services a plugin sees. The machine only for trusted plugins. */
  servicesFor(plugin: Plugin): HostServices {
    const id = plugin.manifest.id;
    const store = this.opts.store;
    const self = this;
    return {
      events: this.events,
      run: (cmd: string) => self.run(cmd),
      machine: plugin.manifest.trusted ? this.opts.machine : undefined,
      settings: {
        get<T>(key: string, fallback: T): T {
          const k = id + ':' + key;
          const v = store ? store.get(k) : self.memory.get(k);
          return v === undefined ? fallback : (v as T);
        },
        set<T>(key: string, value: T): void {
          const k = id + ':' + key;
          if (store) store.set(k, value); else self.memory.set(k, value);
        },
      },
    };
  }

  /** Run a command by id. */
  async run(commandId: string): Promise<void> {
    const reg = this.commands.get(commandId);
    if (!reg) throw new Error(`no command "${commandId}"`);
    const plugin = this.plugins.get(reg.owner)!;
    const ctx = {host: this.servicesFor(plugin)};
    if (reg.item.enabled && !reg.item.enabled(ctx)) return;
    await reg.item.run(ctx);
  }

  /** The command a key press means right now, if any. A mode-specific binding wins. */
  commandForKey(key: string, mode?: string): string | undefined {
    const k = normaliseKey(key);
    return (mode ? this.keys.get(k + '|' + mode) : undefined)?.item.command ?? this.keys.get(k + '|')?.item.command;
  }

  /** Which plugin opens a file, by its name. */
  handlerFor(fileName: string): FileHandler | undefined {
    const m = /(\.[^.]+)$/.exec(fileName.toLowerCase());
    return m ? this.files.get(m[1])?.item : undefined;
  }

  listCommands(): Command[] { return [...this.commands.values()].map((r) => r.item); }
  listPanels(): PanelContribution[] { return [...this.panels.values()].map((r) => r.item); }
  helpTopic(id: string): HelpTopic | undefined { return this.help.get(id)?.item; }
  isActive(id: string): boolean { return this.active.has(id); }

  private ownerOf(map: Map<string, Registered<unknown>>, key: string): string {
    const r = map.get(key);
    return r ? ` by ${r.owner}` : '';
  }
}
