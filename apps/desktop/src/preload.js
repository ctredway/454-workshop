// Runs before the page, in its own isolated world: the page gets a narrow message link to the
// machine process, the update notice's few calls, Design's file calls, and nothing else from Node or Electron.
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

let port = null, queue = [];
const listeners = [];
ipcRenderer.on('machine-port', (e) => {
  port = e.ports[0];
  port.onmessage = (ev) => listeners.forEach((f) => { try { f(ev.data); } catch (err) { console.error(err); } });
  port.start();
  queue.forEach((m) => port.postMessage(m)); queue = [];
});

contextBridge.exposeInMainWorld('desktop454', {
  machine: {
    send: (m) => (port ? port.postMessage(m) : queue.push(m)),
    onMessage: (f) => { listeners.push(f); },
  },
  // the update notice in the header (update-badge.js): what the app has found, and the notice's buttons
  updates: {
    view: () => ipcRenderer.invoke('updates:view'),
    do: (action) => ipcRenderer.invoke('updates:do', String(action)),
    onChange: (f) => { ipcRenderer.on('updates:view', (_e, v) => { try { f(v); } catch (err) { console.error(err); } }); },
  },
  // Design's files, by path (src/design-files.js), so Save goes back to the file a drawing came from
  files: {
    open: (kind) => ipcRenderer.invoke('files:open', kind === 'import' ? 'import' : 'open'),   // [{path, name, data}]
    saveAs: (text, suggested) => ipcRenderer.invoke('files:saveAs', String(text), suggested || ''),   // {path, name} or null
    save: (p, text) => ipcRenderer.invoke('files:save', String(p), String(text)),    // {ok, name} or {ok: false, why}
    pathOf: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  },
  platform: process.platform,
  autopick: process.env.P454_AUTOPICK === '1',       // tests: choose the first port without asking
});
