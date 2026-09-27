# 454 architecture

454 is **one desktop application built from plugins**: design, CAM, machine control and file
import are separate plugins sharing one core. It replaces the two single-file browser apps
(454 Design and 454 Control), whose behaviour it carries over unchanged and tested.

## Goals, in order

1. **The machine is never at the mercy of the screen.** Streaming to the controller runs in its
   own process. A frozen window or busy redraw cannot stall a running job.
2. **Safety is enforced by the core, not by plugins.** No plugin can switch it off.
3. **Behaviour is pinned by tests before code is changed.** Real job files are the reference.
4. **Carbide Motion's process, step for step.** People's habits come from Carbide Motion: when
   they're prompted, what they press, when the machine moves. 454 follows that order; its extra
   safety lives in quiet guards that don't change it, and any unavoidable difference is documented.
5. **One app, many plugins.** Drawing, toolpaths, the machine and VCarve import are plugins;
   a paid CAM would be one more plugin.

## Layout

```
packages/
  plugin-api/   the contract between core and plugins, and the host that enforces it   (MIT)
  gcode/        G-code parsing and checking, as the machine side sees it               (MIT)
  grbl/         the controller protocol: streaming, status, alarms, the simulator      (MIT)   next
  geom/         geometry: offsets, distance fields, tessellation                        (MIT)   next
  vcarve/       reading VCarve .crv projects and .vtdb tool libraries                   (MIT)   next
  cam/          toolpaths: profile, pocket, drill, chamfer                     (private if paid)
  ui/           theme, dialogs, help, shared controls                                   (MIT)
apps/
  desktop/      the Electron shell: main process (machine service) and window
plugins/
  design/  cam/  control/  vcarve/  tools/     first-party plugins
```

## The core

The core owns only what every plugin shares:

| Service | What it holds |
|---|---|
| Document | shapes with stable ids, dimensions, material (size, thickness, Z zero) |
| Undo | one history for the document; plugins contribute undoable operations |
| Settings | per plugin, kept apart from every other plugin's |
| Tool library | tools, machines, materials, feeds and speeds; shared by all plugins |
| Commands and shortcuts | registered by plugins; clashing shortcuts are refused |
| Files | which plugin opens which file type; one owner per type |
| Machine | the controller connection and job runner, in the main process |
| Theme and help | appearance, dialogs, the ⓘ help topics |

## Plugins

A plugin is a manifest plus contributions:

```ts
{
  manifest: { id: '454.design', name: 'Design', version: '1.0.0', apiVersion: 1, trusted: true },
  contributes: {
    commands:     [{ id: 'sketch.fillet', title: 'Fillet', run }],
    keybindings:  [{ key: 'F', command: 'sketch.fillet' }],
    panels:       [...],
    fileHandlers: [{ id: 'crv', extensions: ['.crv'], open }],
    help:         [...],
  },
  activate(host) { ... },
}
```

Extension points planned beyond these: drawing tools, toolpath types, post-processors,
machine drivers (GRBL now; grblHAL and FluidNC later), accessories (BitSetter, BitZero),
checks (drawing and job), and settings pages.

### Rules the host enforces

- **Shortcuts can't clash.** Registering a key already taken is refused, naming both plugins.
  (The browser version had F meaning Fillet in some tools and Fit in others.)
- **Registration is all or nothing.** A refused plugin leaves nothing behind.
- **API versions and dependencies are checked.** A plugin for a newer 454, or missing a plugin
  it needs, is refused with a reason.
- **One owner per file type.**
- **Only trusted, first-party plugins receive the machine.**

## The machine service

Runs in the Electron main process, not the window. It owns the serial port and streams jobs
with GRBL's character-counting protocol. It applies every safety step itself, whatever the
job or plugin: spin-up dwells after M3, lifts that never move down, homing required, the
BitSetter reference taken at Z zero, the end-of-job sequence, and a controlled End job. The
window receives status over IPC and sends requests; if the window hangs, the job does not.

## Testing

- **Golden tests** pin behaviour to real files: every segment the parser produces for real
  jobs is compared with what 454 Control produced.
- **A simulated GRBL controller** (next) will let whole jobs run in tests, including tool
  changes, End job, BitSetter and recovery, with the moves the machine would make checked.
- **CI** runs every test on every push.

## Migration

Not a rewrite. Each module moves across **unchanged**, is pinned by golden tests, and only
then is refactored and typed. The browser apps keep working until the desktop app replaces
them, so there is always a working sender.

| Step | Status |
|---|---|
| Plugin API and host, with tests | done |
| G-code parser, moved unchanged, golden-tested on 4 real jobs | done |
| GRBL protocol and a simulated controller | next |
| Job builder (spin-up, lifts, tool changes, ending), golden-tested | next |
| Geometry and CAM engines | then |
| VCarve readers | then |
| Electron shell with the machine service in the main process | then |
| Design, CAM and Control as plugins | then |
