// Runs before the page, in its own isolated world: the page gets a narrow message link to the
// machine process, and nothing else from Node or Electron.
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
  platform: process.platform,
  autopick: process.env.P454_AUTOPICK === '1',       // tests: choose the first port without asking
});
