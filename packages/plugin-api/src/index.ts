/**
 * 454 plugin API.
 *
 * 454 is one application built from plugins. The core owns what every part shares (the
 * document, undo, settings, the tool library, commands and shortcuts, files, and the machine);
 * plugins contribute through defined extension points.
 *
 * Two rules the host enforces, whatever a plugin asks for:
 *   1. Shortcuts can't clash. A plugin claiming a key that is already taken is refused at
 *      registration, so a key never silently means two things.
 *   2. Only trusted, first-party plugins may drive the machine. Safety behaviour (spin-up
 *      waits, lifts that never move down, homing before a job, a controlled End job) lives in
 *      the core machine service, not in plugins, so no plugin can switch it off.
 */

// ---------------------------------------------------------------- manifests

/** What a plugin says about itself. */
export interface PluginManifest {
  /** Unique id, reverse-domain style: "454.design", "454.cam", "acme.laser". */
  id: string;
  name: string;
  version: string;
  /** The plugin API version this plugin was written against. */
  apiVersion: number;
  /** First-party plugins shipped with 454. Only these may use the machine. */
  trusted?: boolean;
  /** Plugins that must be active first, by id. */
  requires?: string[];
}

/** The API version this host implements. Plugins declaring a newer one are refused. */
export const API_VERSION = 1;

// ---------------------------------------------------------------- contributions

/** Something the user can do, from a menu, a button or a shortcut. */
export interface Command {
  id: string;
  title: string;
  /** Plain-language explanation, shown as a tooltip and in help. */
  description?: string;
  run(ctx: CommandContext): void | Promise<void>;
  /** When false, the command is shown disabled. */
  enabled?(ctx: CommandContext): boolean;
}

export interface CommandContext {
  host: HostServices;
}

/** A key bound to a command. Keys are written like "F", "Shift+M", "Ctrl+Z", "Home". */
export interface Keybinding {
  key: string;
  command: string;
  /** Optional: the binding only applies while this mode is active, e.g. "sketch". */
  when?: string;
}

/** A panel shown in the app: the toolpath list, the machine controls, the tool library. */
export interface PanelContribution {
  id: string;
  title: string;
  /** Where it goes. */
  area: 'left' | 'right' | 'bottom' | 'modal';
  /** Help topic id for its ⓘ button. */
  help?: string;
}

/** Opens a kind of file: .crv, .dxf, .nc, .454. */
export interface FileHandler {
  id: string;
  /** Lower-case extensions including the dot: [".crv"]. */
  extensions: string[];
  description: string;
  open(bytes: Uint8Array, name: string, host: HostServices): Promise<void>;
}

/** A plain-language explanation for an ⓘ button. */
export interface HelpTopic {
  id: string;
  title: string;
  body: string;
}

/** Everything a plugin can contribute. All optional. */
export interface Contributions {
  commands?: Command[];
  keybindings?: Keybinding[];
  panels?: PanelContribution[];
  fileHandlers?: FileHandler[];
  help?: HelpTopic[];
}

/** A plugin: its manifest, what it contributes, and code run when it starts. */
export interface Plugin {
  manifest: PluginManifest;
  contributes?: Contributions;
  activate?(host: HostServices): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

// ---------------------------------------------------------------- host services

/** A simple publish/subscribe channel, for plugins to hear what happened elsewhere. */
export interface Events {
  on(event: string, fn: (payload?: unknown) => void): () => void;
  emit(event: string, payload?: unknown): void;
}

/** The machine, as seen by plugins. Only trusted plugins receive it. */
export interface MachineAccess {
  /** Queue a G-code program. The core adds every safety step itself. */
  runJob(gcode: string, name: string): Promise<void>;
  /** Controlled stop: decelerate, then lift clear and park. */
  endJob(): Promise<void>;
}

/** What the host offers a plugin. */
export interface HostServices {
  readonly events: Events;
  /** Run a command by id. */
  run(commandId: string): Promise<void>;
  /** Present only for trusted plugins. */
  readonly machine?: MachineAccess;
  /** Settings kept for this plugin, separately from every other plugin's. */
  settings: {
    get<T>(key: string, fallback: T): T;
    set<T>(key: string, value: T): void;
  };
}

/** Why a plugin, or part of it, was refused. */
export class PluginError extends Error {
  constructor(message: string, readonly pluginId: string) {
    super(message);
    this.name = 'PluginError';
  }
}

export { Host, normaliseKey, type HostOptions } from './host.js';
