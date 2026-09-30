/* ---------------- Preview in wood, in 3D ----------------
   The simulated material (woodSim, in wood-preview.js) as a solid block you can turn and look at from any side:
   the top surface with every cut in it, the board's edges, and the spoilboard underneath showing through
   through-cuts. Drag to turn it, right-drag (or Shift+drag) to move it, scroll to zoom; Angled, Top and Front
   put the view back square. three.js is loaded the first time it's needed (the desktop app has its own copy);
   without it, or without 3D graphics, the flat shaded picture is shown instead.
   woodMesh is a plain function of the simulation (tested on its own). */
var WOOD_THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
var WOOD3D = null;                 // {renderer, scene, camera, mesh, board, orbit, host}

// The block as triangles, in three.js's axes (x right, y up, z towards the viewer; the drawing's y is -z).
// Big grids are thinned to about maxVerts points, each taking the lowest height in its patch, so thinning
// never hides a cut. Returns {pos, col, idx, mx, my, k}: the top is mx by my points, every k cells.
function woodMesh(sim, maxVerts){
  maxVerts = maxVerts || 500000;
  var k = Math.max(1, Math.ceil(Math.sqrt(sim.nx * sim.ny / maxVerts)));
  var mx = Math.ceil(sim.nx / k), my = Math.ceil(sim.ny / k), cs = sim.cell * k;
  var nTop = mx * my, nEdge = 2 * (mx + my) * 2;
  var pos = new Float32Array((nTop + nEdge) * 3), col = new Float32Array((nTop + nEdge) * 3);
  var span = Math.max(1e-6, sim.top - sim.bottom);
  function heightAt(i, j){                                        // the lowest cell in the patch
    var lo = Infinity;
    for (var b = j * k; b < Math.min(sim.ny, (j + 1) * k); b++)
      for (var a = i * k; a < Math.min(sim.nx, (i + 1) * k); a++){ var h = sim.z[b * sim.nx + a]; if (h < lo) lo = h; }
    return lo;
  }
  function paint(o, h){
    var c;
    if (h <= sim.bottom + 1e-6) c = WOOD_BOARD;
    else { var f = Math.pow(Math.min(1, Math.max(0, (sim.top - h) / span)), 0.6);
      c = [WOOD_TOP[0] + (WOOD_DEEP[0] - WOOD_TOP[0]) * f, WOOD_TOP[1] + (WOOD_DEEP[1] - WOOD_TOP[1]) * f, WOOD_TOP[2] + (WOOD_DEEP[2] - WOOD_TOP[2]) * f]; }
    col[o] = c[0] / 255; col[o + 1] = c[1] / 255; col[o + 2] = c[2] / 255;
  }
  var v = 0, tops = new Float32Array(nTop);
  for (var j = 0; j < my; j++) for (var i = 0; i < mx; i++){
    var h = heightAt(i, j), x = sim.x0 + Math.min(sim.nx * sim.cell, (i + 0.5) * cs), y = sim.y0 + Math.min(sim.ny * sim.cell, (j + 0.5) * cs);
    tops[j * mx + i] = h;
    pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = -y; paint(v * 3, h); v++;
  }
  var idx = [];
  for (var j2 = 0; j2 + 1 < my; j2++) for (var i2 = 0; i2 + 1 < mx; i2++){
    var a0 = j2 * mx + i2, b0 = a0 + 1, c0 = a0 + mx, d0 = c0 + 1;
    idx.push(a0, b0, c0, b0, d0, c0);                             // counter-clockwise seen from above
  }
  // the board's four edges: each top-edge point and one straight below it at the bottom, as a wall
  var edges = [[], [], [], []];
  for (var e0 = 0; e0 < mx; e0++){ edges[0].push(e0); edges[2].push((my - 1) * mx + (mx - 1 - e0)); }
  for (var e1 = 0; e1 < my; e1++){ edges[1].push(e1 * mx + mx - 1); edges[3].push((my - 1 - e1) * mx); }
  edges.forEach(function (run){
    var first = v;
    run.forEach(function (t){
      var tx = pos[t * 3], tz = pos[t * 3 + 2];
      pos[v * 3] = tx; pos[v * 3 + 1] = tops[t]; pos[v * 3 + 2] = tz; col[v * 3] = WOOD_DEEP[0] / 255 * 0.9; col[v * 3 + 1] = WOOD_DEEP[1] / 255 * 0.9; col[v * 3 + 2] = WOOD_DEEP[2] / 255 * 0.9; v++;
      pos[v * 3] = tx; pos[v * 3 + 1] = sim.bottom; pos[v * 3 + 2] = tz; col[v * 3] = WOOD_DEEP[0] / 255 * 0.8; col[v * 3 + 1] = WOOD_DEEP[1] / 255 * 0.8; col[v * 3 + 2] = WOOD_DEEP[2] / 255 * 0.8; v++;
    });
    for (var s = 0; s + 1 < run.length; s++){
      var p = first + s * 2, q = p + 2;
      idx.push(p, p + 1, q, q, p + 1, q + 1);
    }
  });
  return {pos: pos.subarray(0, v * 3), col: col.subarray(0, v * 3), idx: new Uint32Array(idx), mx: mx, my: my, k: k};
}

// three.js, loaded once; cb(true) when it's there, cb(false) if it can't be had.
function woodThree(cb){
  if (typeof THREE !== 'undefined') return cb(true);
  if (woodThree.failed || typeof document === 'undefined' || !document.head || !document.createElement) return cb(false);
  var waiting = woodThree.waiting || (woodThree.waiting = []);
  waiting.push(cb);
  if (waiting.length > 1) return;
  var s = document.createElement('script');
  s.src = WOOD_THREE_SRC;
  s.onload = function (){ woodThree.waiting = null; waiting.forEach(function (f){ f(typeof THREE !== 'undefined'); }); };
  s.onerror = function (){ woodThree.failed = true; woodThree.waiting = null; waiting.forEach(function (f){ f(false); }); };
  document.head.appendChild(s);
}
// Show the simulation in 3D in #wood3d. Returns false (and shows nothing) if 3D can't be drawn here.
function woodShow3D(sim){
  var host = document.getElementById('wood3d');
  if (!host || typeof THREE === 'undefined') return false;
  if (!WOOD3D){
    var renderer;
    try { renderer = new THREE.WebGLRenderer({antialias: true}); } catch (e){ return false; }
    if (!renderer || !renderer.getContext || !renderer.getContext()) return false;
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    host.appendChild(renderer.domElement);
    var scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.38));
    var sun = new THREE.DirectionalLight(0xffffff, 0.62); sun.position.set(-1, 2, 1.2); scene.add(sun);
    var fill = new THREE.DirectionalLight(0xffffff, 0.14); fill.position.set(1, 0.6, -1); scene.add(fill);
    WOOD3D = {renderer: renderer, scene: scene, camera: new THREE.PerspectiveCamera(40, 1, 0.1, 100000), mesh: null, board: null, host: host,
              orbit: {theta: -0.6, phi: 0.95, radius: 300, target: new THREE.Vector3()}};
    woodWire3D();
  }
  var W = WOOD3D, m = woodMesh(sim);
  if (W.mesh){ W.scene.remove(W.mesh); W.mesh.geometry.dispose(); }
  if (W.board){ W.scene.remove(W.board); W.board.geometry.dispose(); }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeVertexNormals();
  W.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({vertexColors: true, side: THREE.DoubleSide}));
  W.scene.add(W.mesh);
  // the spoilboard: a little wider than the material, just under it, seen through through-cuts
  var bw = sim.nx * sim.cell, bh = sim.ny * sim.cell, pad = Math.max(bw, bh) * 0.08;
  var bg = new THREE.PlaneGeometry(bw + 2 * pad, bh + 2 * pad);
  W.board = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({color: new THREE.Color(WOOD_BOARD[0] / 255, WOOD_BOARD[1] / 255, WOOD_BOARD[2] / 255)}));
  W.board.rotation.x = -Math.PI / 2;
  W.board.position.set(sim.x0 + bw / 2, sim.bottom - Math.max(0.05, (sim.top - sim.bottom) * 0.002), -(sim.y0 + bh / 2));
  W.scene.add(W.board);
  W.scene.background = new THREE.Color(0x2a2f36);
  W.fit = {x: sim.x0 + bw / 2, y: (sim.top + sim.bottom) / 2, z: -(sim.y0 + bh / 2), size: Math.max(bw, bh, sim.top - sim.bottom)};
  woodView('angled');
  woodResize3D();
  return true;
}
// Put the view back square: 'angled' (from the front left, above), 'top', or 'front'.
function woodView(name){
  var W = WOOD3D;
  if (!W || !W.fit) return;
  var o = W.orbit;
  o.target.set(W.fit.x, W.fit.y, W.fit.z);
  o.radius = W.fit.size * 1.35;
  if (name === 'top'){ o.theta = 0; o.phi = 0.001; }
  else if (name === 'front'){ o.theta = 0; o.phi = 1.25; }
  else { o.theta = -0.55; o.phi = 0.9; }
  woodCamera();
}
function woodCamera(){
  var W = WOOD3D, o = W.orbit, t = o.target;
  W.camera.position.set(t.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta), t.y + o.radius * Math.cos(o.phi), t.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta));
  W.camera.up.set(0, 1, 0);
  if (o.phi < 0.01) W.camera.up.set(0, 0, -1);                 // straight down: the far side of the material at the top
  W.camera.lookAt(t);
  W.camera.near = Math.max(0.05, o.radius / 1000); W.camera.far = o.radius * 20; W.camera.updateProjectionMatrix();
  W.renderer.render(W.scene, W.camera);
}
function woodResize3D(){
  var W = WOOD3D;
  if (!W) return;
  var w = W.host.clientWidth, h = W.host.clientHeight;
  if (!w || !h) return;
  W.renderer.setSize(w, h);
  W.camera.aspect = w / h;
  woodCamera();
}
// Drag to turn, right-drag or Shift+drag to move, scroll to zoom.
function woodWire3D(){
  var W = WOOD3D, el = W.renderer.domElement, drag = null;
  el.addEventListener('contextmenu', function (e){ e.preventDefault(); });
  el.addEventListener('pointerdown', function (e){ drag = {x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey}; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', function (e){
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y, o = W.orbit;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.pan){
      o.theta -= dx * 0.006;
      o.phi = Math.min(Math.PI / 2 - 0.02, Math.max(0.001, o.phi - dy * 0.006));   // never below the board
    } else {
      var k = o.radius * 0.0016, dir = new THREE.Vector3();
      W.camera.getWorldDirection(dir);
      var right = dir.clone().cross(W.camera.up).normalize(), up = right.clone().cross(dir).normalize();
      o.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    }
    woodCamera();
  });
  el.addEventListener('pointerup', function (){ drag = null; });
  el.addEventListener('wheel', function (e){
    e.preventDefault();
    W.orbit.radius = Math.max(1, Math.min(W.fit ? W.fit.size * 10 : 1e5, W.orbit.radius * (e.deltaY > 0 ? 1.12 : 0.89)));
    woodCamera();
  }, {passive: false});
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(woodResize3D).observe(W.host);
}
