// A small 3D view for the gadgets: solid parts, lit from above, turned by dragging, zoomed with the wheel or a
// pinch. WebGL 1, nothing else. Z is up, as in a slicer.
//
//   const v = viewer(canvas);  v.show([{ mesh, color: [r, g, b], at: [x, y, z] }], { keepView });  v.reset();
// mesh: a Manifold mesh ({ vertProperties, numProp, triVerts }). Returns null where there's no WebGL.

const VS = `attribute vec3 p; attribute vec3 n; uniform mat4 m; varying vec3 vn; varying float vz;
void main(){ vn = n; vz = p.z; gl_Position = m * vec4(p, 1.0); }`;
const FS = `precision mediump float; varying vec3 vn; varying float vz; uniform vec3 c;
void main(){ vec3 l = normalize(vec3(-0.35, -0.55, 0.85)); float d = max(dot(normalize(vn), l), 0.0);
  float b = 0.38 + 0.62 * d; gl_FragColor = vec4(c * b, 1.0); }`;

function mul(a, b) {                 // 4x4, column-major
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
  return o;
}
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(e, c, up) {
  const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function viewer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  const aP = gl.getAttribLocation(prog, 'p'), aN = gl.getAttribLocation(prog, 'n'), uM = gl.getUniformLocation(prog, 'm'), uC = gl.getUniformLocation(prog, 'c');
  let items = [], box = null, yaw = -0.6, pitch = 0.75, dist = 1, centre = [0, 0, 0], radius = 1, bg = [0.08, 0.094, 0.114];

  function upload(mesh, at) {
    const v = mesh.vertProperties, n = mesh.numProp, t = mesh.triVerts;
    const pos = new Float32Array(t.length * 3), nor = new Float32Array(t.length * 3);
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k] * n, b = t[k + 1] * n, c = t[k + 2] * n;
      const A = [v[a] + at[0], v[a + 1] + at[1], v[a + 2] + at[2]], B = [v[b] + at[0], v[b + 1] + at[1], v[b + 2] + at[2]], C = [v[c] + at[0], v[c + 1] + at[1], v[c + 2] + at[2]];
      const f = norm(cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]));
      [A, B, C].forEach((P, i) => { pos.set(P, (k + i) * 3); nor.set(f, (k + i) * 3); grow(P); });
    }
    const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
    return { pb, nb, count: t.length };
  }
  function grow(P) {
    if (!box) box = [P[0], P[1], P[2], P[0], P[1], P[2]];
    for (let i = 0; i < 3; i++) { box[i] = Math.min(box[i], P[i]); box[i + 3] = Math.max(box[i + 3], P[i]); }
  }
  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    if (!items.length) return;
    const eye = [centre[0] + dist * Math.cos(pitch) * Math.sin(yaw), centre[1] - dist * Math.cos(pitch) * Math.cos(yaw), centre[2] + dist * Math.sin(pitch)];
    const m = mul(perspective(0.6, w / Math.max(h, 1), dist / 50, dist * 10), lookAt(eye, centre, [0, 0, 1]));
    gl.useProgram(prog); gl.uniformMatrix4fv(uM, false, m);
    for (const it of items) {
      gl.uniform3fv(uC, it.color);
      gl.bindBuffer(gl.ARRAY_BUFFER, it.pb); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, it.nb); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, it.count);
    }
  }
  function fit() {
    centre = [(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2];
    radius = Math.hypot(box[3] - box[0], box[4] - box[1], box[5] - box[2]) / 2 || 1;
    dist = radius / Math.sin(0.3) * 0.82;   // a long tray's ends may touch the edges; it fills the view
  }
  let frame = 0;
  const redraw = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); };

  // turning and zooming: drag (mouse, pen or one finger), the wheel, or two fingers
  const pts = new Map();
  canvas.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const [x0, y0] = pts.get(e.pointerId);
    if (pts.size === 1) {
      yaw -= (e.clientX - x0) * 0.008; pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - y0) * 0.008));
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()], before = Math.hypot(a[0] - b[0], a[1] - b[1]);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const [c, d] = [...pts.values()], after = Math.hypot(c[0] - d[0], c[1] - d[1]);
      if (before > 0 && after > 0) dist = Math.max(radius * 0.4, Math.min(radius * 12, dist * before / after));
    }
    pts.set(e.pointerId, [e.clientX, e.clientY]); redraw();
  });
  const up = (e) => pts.delete(e.pointerId);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.max(radius * 0.4, Math.min(radius * 12, dist * Math.exp(e.deltaY * 0.001))); redraw(); }, { passive: false });
  if (window.ResizeObserver) new ResizeObserver(redraw).observe(canvas);

  return {
    // parts: [{ mesh, color, at }]; keepView leaves the camera where the viewer put it
    show(parts, opt = {}) {
      for (const it of items) { gl.deleteBuffer(it.pb); gl.deleteBuffer(it.nb); }
      box = null;
      items = parts.map((p) => Object.assign(upload(p.mesh, p.at || [0, 0, 0]), { color: p.color }));
      if (box && !opt.keepView) fit();
      redraw();
    },
    reset() { yaw = -0.6; pitch = 0.75; if (box) fit(); redraw(); },
    background(rgb) { bg = rgb; redraw(); },
  };
}
