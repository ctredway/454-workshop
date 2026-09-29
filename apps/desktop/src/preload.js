// Runs before the page, in its own isolated world: the page gets a narrow message link to the
// machine process, the update notice's few calls, and nothing else from Node or Electron.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

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
  platform: process.platform,
  autopick: process.env.P454_AUTOPICK === '1',       // tests: choose the first port without asking
});
