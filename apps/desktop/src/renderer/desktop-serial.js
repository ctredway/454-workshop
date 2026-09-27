// Web Serial, as far as 454 Control uses it, backed by the desktop app's machine process. Loaded
// before Control's own code, so Control runs unchanged: requestPort shows a port list here instead
// of Chrome's, and every read and write goes through the machine process.
(function () {
  'use strict';
  if (!window.desktop454) return;                     // in a browser: leave the real Web Serial alone
  var M = window.desktop454.machine, nextId = 1, pending = {}, current = null, known = [];
  var events = new EventTarget();

  function call(type, extra) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      M.send(Object.assign({ id: id, type: type }, extra || {}));
    });
  }
  M.onMessage(function (m) {
    if (m.id && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.ok) p.resolve(m); else p.reject(new Error(m.error || 'failed'));
      return;
    }
    if (m.type === 'data' && current) current._push(m.data);
    else if (m.type === 'closed' && current) current._closed(m.error);
    else if (m.type === 'ports') {
      var before = known.map(function (p) { return p.path; });
      known = m.ports;
      var now = known.map(function (p) { return p.path; });
      if (now.some(function (x) { return before.indexOf(x) < 0; })) events.dispatchEvent(new Event('connect'));
      if (before.some(function (x) { return now.indexOf(x) < 0; })) events.dispatchEvent(new Event('disconnect'));
    }
  });

  function Port(info) { this._info = info; this.readable = null; this.writable = null; }
  Port.prototype.getInfo = function () {
    return { usbVendorId: this._info.vendorId === null ? undefined : this._info.vendorId,
             usbProductId: this._info.productId === null ? undefined : this._info.productId };
  };
  Port.prototype.open = function (opts) {
    var self = this;
    return call('open', { path: this._info.path, baudRate: (opts && opts.baudRate) || 115200 }).then(function () {
      current = self;
      self.readable = new ReadableStream({
        start: function (c) { self._ctrl = c; },
        cancel: function () { self._ctrl = null; },
      });
      self.writable = new WritableStream({
        write: function (chunk) { return call('write', { data: chunk }); },
      });
    });
  };
  Port.prototype._push = function (data) { if (this._ctrl) try { this._ctrl.enqueue(new Uint8Array(data)); } catch (e) {} };
  Port.prototype._closed = function (error) {
    var c = this._ctrl; this._ctrl = null; current = null;
    if (c) try { if (error) c.error(new Error(error)); else c.close(); } catch (e) {}
    if (error) events.dispatchEvent(new Event('disconnect'));     // unplugged: Control stops the job and says so
  };
  Port.prototype.close = function () {
    if (current === this) current = null;
    return call('close').then(function () {});
  };

  // choosing a port: a small list in the page, in place of Chrome's picker
  function pick(ports) {
    return new Promise(function (resolve, reject) {
      if (!ports.length) { reject(new DOMException('No serial ports found. Is the controller plugged in and switched on?', 'NotFoundError')); return; }
      if (window.desktop454.autopick) { resolve(ports[0]); return; }
      var box = document.createElement('div');
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Choose the machine\u2019s port');
      box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999;font:14px system-ui,sans-serif';
      var card = document.createElement('div');
      card.style.cssText = 'background:#1d232b;color:#dce3ea;border:1px solid #2a323c;border-radius:8px;padding:16px 18px;min-width:320px;max-width:90vw';
      card.innerHTML = '<div style="font-weight:600;margin-bottom:10px">Choose the machine\u2019s port</div>';
      function done(v, err) { document.body.removeChild(box); if (err) reject(err); else resolve(v); }
      ports.forEach(function (p) {
        var b = document.createElement('button');
        b.textContent = p.path + (p.manufacturer ? '  \u2014  ' + p.manufacturer : '');
        b.style.cssText = 'display:block;width:100%;text-align:left;margin:4px 0;padding:8px 10px;background:#232b35;color:inherit;border:1px solid #2a323c;border-radius:5px;cursor:pointer;font:inherit';
        b.onclick = function () { done(p); };
        card.appendChild(b);
      });
      var cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.style.cssText = 'margin-top:10px;padding:6px 12px;background:transparent;color:#8794a1;border:1px solid #2a323c;border-radius:5px;cursor:pointer;font:inherit';
      cancel.onclick = function () { done(null, new DOMException('No port selected.', 'NotFoundError')); };
      card.appendChild(cancel);
      box.appendChild(card); document.body.appendChild(box);
      var first = card.querySelector('button'); if (first) first.focus();
    });
  }

  var serial = {
    requestPort: function () { return call('list').then(function (r) { known = r.ports; return pick(r.ports); }).then(function (p) { return new Port(p); }); },
    getPorts: function () { return call('list').then(function (r) { known = r.ports; return r.ports.map(function (p) { return new Port(p); }); }); },
    addEventListener: function (t, f) { events.addEventListener(t, f); },
    removeEventListener: function (t, f) { events.removeEventListener(t, f); },
  };
  Object.defineProperty(navigator, 'serial', { value: serial, configurable: true });
})();
