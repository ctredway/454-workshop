/**
 * A simulated GRBL 1.1 controller, faithful where 454's behaviour depends on it:
 *  - a 128-byte receive buffer and a 15-block planner; `ok` is sent when a line is accepted, and a
 *    full planner stops the parser (so lines wait in the receive buffer, as on the real board)
 *  - status reports in GRBL's format; real-time commands (? ! ~ and soft reset)
 *  - feed hold decelerates to Hold:0; a reset while moving raises ALARM:3 and loses position
 *  - with homing enabled it starts in Alarm; $H homes, $X unlocks
 *  - G38.2/G38.3 against a simulated switch (ALARM:5 when G38.2 finds nothing)
 *  - M3/M4/M5 take effect in order with the moves; M6 is rejected with error:20, as GRBL does
 * Time is virtual: call step(dt) to advance it. Everything the machine did goes on `timeline`.
 */
export type Vec = { x: number; y: number; z: number };
export interface SimOptions {
  settings?: Record<number, number>;
  /** Machine position at power-up. */
  start?: Vec;
  /** Where homing ends (machine coordinates). */
  home?: Vec;
  /** A probe switch: triggers when the tool reaches this machine Z within `radius` of (x, y). */
  probe?: { x: number; y: number; z: number; radius: number } | null;
}
export interface Block {
  kind: 'move' | 'dwell' | 'spindle' | 'probe' | 'home';
  from: Vec; to: Vec; duration: number; rapid: boolean; feed: number;
  spindle?: { on: boolean; rpm: number };
  line: string; lineNo: number;
  probe?: { mode: string };
}
export interface Event { t: number; kind: string; line: string; lineNo: number; from: Vec; to: Vec; spindleOn: boolean; rpm: number; wco: Vec; tlo: number; rapid?: boolean }

const DEFAULT_SETTINGS: Record<number, number> = { 11: 0.01, 20: 1, 21: 1, 22: 1, 23: 0, 27: 1, 30: 24000, 31: 0, 32: 0,
  110: 5000, 111: 5000, 112: 1000, 120: 400, 121: 400, 122: 50, 130: 838, 131: 838, 132: 100 };

export class GrblSim {
  settings: Record<number, number>;
  mpos: Vec; wco: Vec = { x: 0, y: 0, z: 0 }; tlo = 0;
  state = 'Idle'; homed = false; alarm = 0;
  t = 0;
  out: string[] = [];                 // lines the controller has sent
  timeline: Event[] = [];
  rx = '';                            // receive buffer (unparsed characters)
  planner: Block[] = [];              // queued blocks, the first is running
  running: { b: Block; start: number } | null = null;
  holdUntil = -1;
  modal = { units: 21, abs: true, motion: 0, feed: 0, plane: 17 };
  spindle = { on: false, rpm: 0 };    // as executed (in step with the moves)
  plannedSpindle = { on: false, rpm: 0 };
  plannedPos: Vec;                    // where the last queued block ends
  prb: Vec | null = null;
  lineNo = 0;
  errors: string[] = [];
  opts: SimOptions;

  constructor(opts: SimOptions = {}) {
    this.opts = opts;
    this.settings = { ...DEFAULT_SETTINGS, ...(opts.settings || {}) };
    this.mpos = { ...(opts.start || { x: -5, y: -5, z: -5 }) };
    this.plannedPos = { ...this.mpos };
    this.boot();
  }
  private boot() {
    this.send("Grbl 1.1f ['$' for help]");
    if (this.settings[22]) { this.state = 'Alarm'; this.send("[MSG:'$H'|'$X' to unlock]"); }
  }
  private send(s: string) { this.out.push(s); }
  /** Bytes from the host. Real-time characters act at once; everything else goes in the receive buffer. */
  write(data: string) {
    for (const ch of data) {
      if (ch === '?') { this.send(this.status()); continue; }
      if (ch === '!') { this.feedHold(); continue; }
      if (ch === '~') { this.resume(); continue; }
      if (ch === '\x18') { this.softReset(); continue; }
      if (ch === '\x85') { if (this.state === 'Jog') this.flushMotion(); continue; }
      if (this.rx.length >= 128) { this.errors.push('receive buffer overflow'); continue; }   // the host broke character counting
      this.rx += ch;
    }
    this.parseWaiting();
  }
  get rxFree() { return 128 - this.rx.length; }
  status(): string {
    const f = (v: number) => v.toFixed(3);
    const cur = this.currentPos();
    const st = this.state === 'Hold' ? (this.t < this.holdUntil ? 'Hold:1' : 'Hold:0') : this.state;
    const b = this.running ? this.running.b : null;
    return `<${st}|MPos:${f(cur.x)},${f(cur.y)},${f(cur.z)}|Bf:${15 - this.planner.length},${this.rxFree}|FS:${b && !b.rapid ? b.feed : 0},${this.spindle.on ? this.spindle.rpm : 0}|WCO:${f(this.wco.x)},${f(this.wco.y)},${f(this.wco.z + this.tlo)}>`;
  }
  currentPos(): Vec {
    if (!this.running) return { ...this.mpos };
    const { b, start } = this.running, k = b.duration > 0 ? Math.min(1, (this.t - start) / b.duration) : 1;
    return { x: b.from.x + (b.to.x - b.from.x) * k, y: b.from.y + (b.to.y - b.from.y) * k, z: b.from.z + (b.to.z - b.from.z) * k };
  }
  private feedHold() {
    if (this.state === 'Run' || this.state === 'Jog') {
      if (this.state === 'Jog') { this.flushMotion(); return; }
      this.state = 'Hold'; this.holdUntil = this.t + 0.25;            // decelerating, then Hold:0
      if (this.running) { this.mpos = this.currentPos(); this.running.b.from = { ...this.mpos }; }
    }
  }
  private resume() {
    if (this.state === 'Hold' && this.t >= this.holdUntil) {
      this.state = this.planner.length ? 'Run' : 'Idle';
      if (this.running) { const b = this.running.b; b.duration = this.durationOf(b.from, b.to, b.rapid, b.feed); this.running.start = this.t; }
    }
  }
  private softReset() {
    const moving = this.state === 'Run' || this.state === 'Jog' || (this.state === 'Hold' && this.t < this.holdUntil) || this.state === 'Home';
    if (this.running) this.mpos = this.currentPos();
    this.flushMotion(); this.rx = ''; this.okAfterDwell = false;
    this.spindle = { on: false, rpm: 0 }; this.plannedSpindle = { on: false, rpm: 0 };
    this.modal = { units: 21, abs: true, motion: 0, feed: 0, plane: 17 };
    this.timeline.push(this.ev('reset', 'soft reset', this.mpos, this.mpos));
    if (moving) { this.alarm = 3; this.homed = false; this.state = 'Alarm'; this.send('ALARM:3'); }   // reset while in motion: position lost
    else this.state = this.state === 'Alarm' ? 'Alarm' : 'Idle';
    this.boot2(moving);
  }
  private boot2(alarmed: boolean) {
    this.send("Grbl 1.1f ['$' for help]");
    if (alarmed || (this.settings[22] && !this.homed)) { this.state = 'Alarm'; this.send("[MSG:'$H'|'$X' to unlock]"); }
  }
  private flushMotion() {
    if (this.running) this.mpos = this.currentPos();
    this.planner = []; this.running = null; this.plannedPos = { ...this.mpos };
    if (this.state === 'Run' || this.state === 'Jog' || this.state === 'Hold') this.state = 'Idle';
  }
  private ev(kind: string, line: string, from: Vec, to: Vec, extra: Partial<Event> = {}): Event {
    return { t: this.t, kind, line, lineNo: this.lineNo, from: { ...from }, to: { ...to }, spindleOn: this.spindle.on, rpm: this.spindle.rpm,
             wco: { ...this.wco }, tlo: this.tlo, ...extra };
  }
  /** A line that makes GRBL wait for all motion to finish before it runs (protocol_buffer_synchronize):
   *  dwells, spindle changes and program ends. Its `ok` comes only after that, so a host sees it late. */
  private isSync(line: string): boolean {
    const c = line.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').toUpperCase();
    return /G0*4(?![\d.])/.test(c) || /M0*[2-5](?![\d.])|M30(?![\d.])/.test(c);
  }
  private okAfterDwell = false;                                       // a G4's ok waits for the dwell itself
  /** Parse whole lines from the receive buffer while the planner has room. */
  private parseWaiting() {
    while (true) {
      if (this.okAfterDwell) return;                                  // still dwelling: the parser is held
      const nl = this.rx.indexOf('\n');
      if (nl < 0) return;
      if (this.planner.length >= 15) return;                          // full planner: the line waits, no ok yet
      const line = this.rx.slice(0, nl).replace(/\r$/, '');
      if (this.isSync(line) && (this.planner.length || this.running)) return;   // waits for motion to finish
      this.rx = this.rx.slice(nl + 1);
      this.lineNo++;
      const r = this.execute(line.trim());
      if (r === 0 && /G0*4(?![\d.])/i.test(line) && this.planner.length){ this.okAfterDwell = true; return; }
      this.send(r === 0 ? 'ok' : 'error:' + r);
      if (r !== 0) this.errors.push(`error:${r} on "${line}"`);
    }
  }
  private durationOf(a: Vec, b: Vec, rapid: boolean, feed: number): number {
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (d < 1e-9) return 0;
    const rate = rapid ? Math.min(this.settings[110], this.settings[112] * (d / Math.max(Math.abs(b.z - a.z), 1e-9)), 1e9) : feed;
    return d / Math.max(rate, 1e-6) * 60;
  }
  private queue(b: Block) { this.planner.push(b); this.plannedPos = { ...b.to }; if (this.state === 'Idle') this.state = 'Run'; }
  /** Returns 0 for ok, or GRBL's error number. */
  private execute(line: string): number {
    const code = line.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').trim().toUpperCase();
    if (!code) return 0;
    if (code[0] === '$') return this.dollar(code);
    if (this.state === 'Alarm') return 9;                             // G-code locked out during alarm
    const words: [string, number][] = [];
    const re = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g; let m: RegExpExecArray | null;
    while ((m = re.exec(code))) words.push([m[1], parseFloat(m[2])]);
    const p: Record<string, number> = {}; const gs: number[] = []; const ms: number[] = [];
    for (const [L, V] of words) { if (L === 'G') gs.push(V); else if (L === 'M') ms.push(V); else p[L] = V; }
    for (const M of ms) if (![0, 1, 2, 3, 4, 5, 7, 8, 9, 30, 56].includes(M)) return 20;     // M6 among them: unsupported
    let nonModal53 = false, probeMode = '', dwell = -1, set10 = false;
    for (const G of gs) {
      if ([0, 1, 2, 3].includes(G)) this.modal.motion = G;
      else if (G === 20 || G === 21) this.modal.units = G;
      else if (G === 90) this.modal.abs = true; else if (G === 91) this.modal.abs = false;
      else if (G === 53) nonModal53 = true;
      else if (G === 4) dwell = p.P || 0;
      else if (G === 10) set10 = true;
      else if (Math.abs(G - 38.2) < 1e-6 || Math.abs(G - 38.3) < 1e-6) probeMode = G.toFixed(1);
      else if (Math.abs(G - 43.1) < 1e-6) { this.tlo = (p.Z || 0) * (this.modal.units === 20 ? 25.4 : 1); return 0; }
      else if (G === 49) { this.tlo = 0; }
      else if ([17, 18, 19, 40, 54, 80, 94, 90.1, 91.1, 28, 30, 92].includes(G) || Math.abs(G - 91.1) < 1e-6) { /* accepted */ }
      else return 20;
    }
    const k = this.modal.units === 20 ? 25.4 : 1;
    if (p.F !== undefined) this.modal.feed = p.F * k;
    if (set10) {                                                      // G10 L20 P1: make the current position these work values
      const pos = this.plannedPos;
      if (p.X !== undefined) this.wco.x = pos.x - p.X * k;
      if (p.Y !== undefined) this.wco.y = pos.y - p.Y * k;
      if (p.Z !== undefined) this.wco.z = pos.z - this.tlo - p.Z * k;
      return 0;
    }
    for (const M of ms) {
      if (M === 3 || M === 4) this.plannedSpindle = { on: true, rpm: p.S !== undefined ? p.S : this.plannedSpindle.rpm };
      else if (M === 5 || M === 2 || M === 30) this.plannedSpindle = { on: false, rpm: this.plannedSpindle.rpm };
      if (M === 3 || M === 4 || M === 5 || M === 2 || M === 30)
        this.queue({ kind: 'spindle', from: this.plannedPos, to: this.plannedPos, duration: 0, rapid: false, feed: 0, spindle: { ...this.plannedSpindle }, line: code, lineNo: this.lineNo });
    }
    if (p.S !== undefined && !ms.some((M) => M === 3 || M === 4) && this.plannedSpindle.on) {
      this.plannedSpindle.rpm = p.S;
      this.queue({ kind: 'spindle', from: this.plannedPos, to: this.plannedPos, duration: 0, rapid: false, feed: 0, spindle: { ...this.plannedSpindle }, line: code, lineNo: this.lineNo });
    }
    if (dwell >= 0) { this.queue({ kind: 'dwell', from: this.plannedPos, to: this.plannedPos, duration: dwell, rapid: false, feed: 0, line: code, lineNo: this.lineNo }); return 0; }
    const hasAxis = p.X !== undefined || p.Y !== undefined || p.Z !== undefined;
    if (!hasAxis) return 0;
    const from = { ...this.plannedPos }, to = { ...from };
    const work = (axis: 'x' | 'y' | 'z') => this.wco[axis] + (axis === 'z' ? this.tlo : 0);
    for (const a of ['x', 'y', 'z'] as const) {
      const v = p[a.toUpperCase()];
      if (v === undefined) continue;
      to[a] = nonModal53 ? v * k : this.modal.abs ? v * k + work(a) : from[a] + v * k;
    }
    // soft limits: machine travel is 0 .. -max (or 0 .. +max on machines that count up)
    if (this.settings[20]) {
      for (const [a, s] of [['x', 130], ['y', 131], ['z', 132]] as const) {
        const up = (this.settings[23] >> ({ x: 0, y: 1, z: 2 }[a])) & 1;
        const lo = up ? 0 : -this.settings[s], hi = up ? this.settings[s] : 0;
        if (to[a] < lo - 1e-6 || to[a] > hi + 1e-6) { this.errors.push(`soft limit on ${a}: ${to[a].toFixed(3)} (${code})`); return 15; }
      }
    }
    if (probeMode) {
      this.queue({ kind: 'probe', from, to, duration: this.durationOf(from, to, false, this.modal.feed), rapid: false, feed: this.modal.feed, line: code, lineNo: this.lineNo, probe: { mode: probeMode } });
      return 0;
    }
    const rapid = this.modal.motion === 0;
    if (!rapid && !(this.modal.feed > 0)) return 22;                  // feed rate undefined
    this.queue({ kind: 'move', from, to, duration: this.durationOf(from, to, rapid, this.modal.feed), rapid, feed: this.modal.feed, line: code, lineNo: this.lineNo });
    return 0;
  }
  private dollar(code: string): number {
    if (code === '$$') { Object.keys(this.settings).forEach((k) => this.send(`$${k}=${this.settings[+k]}`)); return 0; }
    if (code === '$#') { const f = (v: number) => v.toFixed(3); this.send(`[G54:${f(this.wco.x)},${f(this.wco.y)},${f(this.wco.z)}]`); this.send(`[TLO:${f(this.tlo)}]`);
      if (this.prb) this.send(`[PRB:${f(this.prb.x)},${f(this.prb.y)},${f(this.prb.z)}:1]`); return 0; }
    if (code === '$I') { this.send('[VER:1.1f.20170801:]'); this.send('[OPT:V,15,128]'); return 0; }
    if (code === '$G') { this.send(`[GC:G${this.modal.motion} G54 G${this.modal.plane} G${this.modal.units} G${this.modal.abs ? 90 : 91} G94 M${this.spindle.on ? 3 : 5} M9 T0 F${this.modal.feed} S${this.spindle.rpm}]`); return 0; }
    if (code === '$X') { if (this.state === 'Alarm') { this.state = 'Idle'; this.alarm = 0; this.send("[MSG:Caution: Unlocked]"); } return 0; }
    if (code === '$H') {
      if (!this.settings[22]) return 5;
      const home = this.opts.home || { x: -1, y: -1, z: -1 };
      this.state = 'Home';
      this.planner.push({ kind: 'home', from: { ...this.mpos }, to: { ...home }, duration: 3, rapid: true, feed: 0, line: code, lineNo: this.lineNo });
      this.plannedPos = { ...home };
      return 0;
    }
    if (code.startsWith('$J=')) {
      if (this.state === 'Alarm') return 9;
      const saveAbs = this.modal.abs, saveMotion = this.modal.motion, saveFeed = this.modal.feed;
      const r = this.execute(code.slice(3).replace(/G53/, 'G53 G1'));
      this.modal.abs = saveAbs; this.modal.motion = saveMotion; this.modal.feed = saveFeed;
      if (r === 0 && this.planner.length) this.state = 'Jog';
      return r;
    }
    if (/^\$\d+=/.test(code)) { const [k, v] = code.slice(1).split('='); this.settings[+k] = parseFloat(v); return 0; }
    return 0;
  }
  /** Advance virtual time. */
  step(dt: number) {
    const end = this.t + dt;
    while (this.t < end - 1e-12) {
      if (this.state === 'Hold' || this.state === 'Alarm') { this.t = end; break; }
      if (!this.running) {
        const b = this.planner[0];
        if (!b) { this.t = end; if (this.state === 'Run' || this.state === 'Jog' || this.state === 'Home') this.state = 'Idle'; break; }
        b.from = { ...this.mpos };
        if (b.kind === 'move' || b.kind === 'probe') b.duration = this.durationOf(b.from, b.to, b.rapid, b.feed);
        this.running = { b, start: this.t };
        if (b.kind === 'spindle') { this.spindle = { ...b.spindle! }; }
        this.timeline.push(this.ev(b.kind, b.line, b.from, b.to, { rapid: b.rapid, lineNo: b.lineNo }));
      }
      const r = this.running!, b = r.b;
      if (b.kind === 'probe' && this.opts.probe) {                    // does the switch trigger on the way?
        const pr = this.opts.probe, cur = this.currentPos();
        if (Math.hypot(cur.x - pr.x, cur.y - pr.y) <= pr.radius && cur.z <= pr.z + 1e-9) {
          this.mpos = { ...cur, z: pr.z }; this.prb = { ...this.mpos };
          const f = (v: number) => v.toFixed(3);
          this.send(`[PRB:${f(this.prb.x)},${f(this.prb.y)},${f(this.prb.z)}:1]`);
          this.planner.shift(); this.running = null; this.plannedPos = { ...this.mpos };
          continue;
        }
      }
      const finish = r.start + b.duration;
      const stepEnd = b.kind === 'probe' ? Math.min(end, finish, this.t + 0.01) : Math.min(end, finish);
      this.t = stepEnd;
      if (this.t >= finish - 1e-12) {
        this.mpos = { ...b.to }; this.planner.shift(); this.running = null;
        if (b.kind === 'dwell' && this.okAfterDwell && !this.planner.length){ this.okAfterDwell = false; this.send('ok'); }
        if (b.kind === 'home') { this.homed = true; this.state = 'Idle'; this.wco = this.wco; }
        if (b.kind === 'probe') {
          if (b.probe!.mode === '38.2') { this.flushMotion(); this.state = 'Alarm'; this.alarm = 5; this.send('ALARM:5'); }
          else { const f = (v: number) => v.toFixed(3); this.send(`[PRB:${f(this.mpos.x)},${f(this.mpos.y)},${f(this.mpos.z)}:0]`); }
        }
        this.parseWaiting();                                          // room in the planner: waiting lines go in
      }
    }
  }
  /** Work position of a machine position, with the current offsets. */
  toWork(p: Vec, wco: Vec = this.wco, tlo: number = this.tlo): Vec { return { x: p.x - wco.x, y: p.y - wco.y, z: p.z - wco.z - tlo }; }
}
