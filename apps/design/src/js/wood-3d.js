/* ---------------- Preview in wood, in 3D ----------------
   The simulated material (woodSim, in wood-preview.js) as a solid block you can turn and look at from any side:
   the top surface with every cut in it, the board's edges, and the spoilboard underneath showing through
   through-cuts. Drag to turn it, right-drag (or Shift+drag) to move it, scroll to zoom; the cube in the corner
   (wood-cube.js) looks from a side, and Reset view puts it back. three.js is loaded the first time it's needed (the desktop app has its own copy);
   without it, or without 3D graphics, the flat shaded picture is shown instead.
   woodMesh is a plain function of the simulation (tested on its own). */
var WOOD_THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
var WOOD3D = null;                 // {renderer, scene, camera, mesh, board, orbit, host}

// The lowest cell in point (i, j)'s patch of k by k cells.
function woodPatchLow(sim, k, i, j){
  var lo = Infinity;
  for (var b = j * k; b < Math.min(sim.ny, (j + 1) * k); b++)
    for (var a = i * k; a < Math.min(sim.nx, (i + 1) * k); a++){ var h = sim.z[b * sim.nx + a]; if (h < lo) lo = h; }
  return lo;
}
// The block as triangles, in three.js's axes (x right, y up, z towards the viewer; the drawing's y is -z).
// Big grids are thinned to about maxVerts points, each taking the lowest height in its patch, so thinning
// never hides a cut. Returns {pos, col, idx, mx, my, k, nTop, edge}: the top is mx by my points (the first nTop),
// every k cells; edge lists, for each pair of points down the board's sides, the top point it stands under.
function woodMesh(sim, maxVerts){
  maxVerts = maxVerts || 500000;
  var k = Math.max(1, Math.ceil(Math.sqrt(sim.nx * sim.ny / maxVerts)));
  var mx = Math.ceil(sim.nx / k), my = Math.ceil(sim.ny / k), cs = sim.cell * k;
  var nTop = mx * my, nEdge = 2 * (mx + my) * 2;
  var pos = new Float32Array((nTop + nEdge) * 3), col = new Float32Array((nTop + nEdge) * 3);
  function paint(o, h){
    var c = woodColour(sim, h);                                   // spoilboard, amber where thin, or wood
    col[o] = c[0] / 255; col[o + 1] = c[1] / 255; col[o + 2] = c[2] / 255;
  }
  var v = 0, tops = new Float32Array(nTop);
  for (var j = 0; j < my; j++) for (var i = 0; i < mx; i++){
    var h = woodPatchLow(sim, k, i, j), x = sim.x0 + Math.min(sim.nx * sim.cell, (i + 0.5) * cs), y = sim.y0 + Math.min(sim.ny * sim.cell, (j + 0.5) * cs);
    tops[j * mx + i] = h;
    pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = -y; paint(v * 3, h); v++;
  }
  var idx = [];
  for (var j2 = 0; j2 + 1 < my; j2++) for (var i2 = 0; i2 + 1 < mx; i2++){
    var a0 = j2 * mx + i2, b0 = a0 + 1, c0 = a0 + mx, d0 = c0 + 1;
    idx.push(a0, b0, c0, b0, d0, c0);                             // counter-clockwise seen from above
  }
  // the board's four edges: each top-edge point and one straight below it at the bottom, as a wall
  var edges = [[], [], [], []], edge = [];
  for (var e0 = 0; e0 < mx; e0++){ edges[0].push(e0); edges[2].push((my - 1) * mx + (mx - 1 - e0)); }
  for (var e1 = 0; e1 < my; e1++){ edges[1].push(e1 * mx + mx - 1); edges[3].push((my - 1 - e1) * mx); }
  edges.forEach(function (run){
    var first = v;
    run.forEach(function (t){
      edge.push(t);
      var tx = pos[t * 3], tz = pos[t * 3 + 2];
      pos[v * 3] = tx; pos[v * 3 + 1] = tops[t]; pos[v * 3 + 2] = tz; col[v * 3] = WOOD_DEEP[0] / 255 * 0.9; col[v * 3 + 1] = WOOD_DEEP[1] / 255 * 0.9; col[v * 3 + 2] = WOOD_DEEP[2] / 255 * 0.9; v++;
      pos[v * 3] = tx; pos[v * 3 + 1] = sim.bottom; pos[v * 3 + 2] = tz; col[v * 3] = WOOD_DEEP[0] / 255 * 0.8; col[v * 3 + 1] = WOOD_DEEP[1] / 255 * 0.8; col[v * 3 + 2] = WOOD_DEEP[2] / 255 * 0.8; v++;
    });
    for (var s = 0; s + 1 < run.length; s++){
      var p = first + s * 2, q = p + 2;
      idx.push(p, p + 1, q, q, p + 1, q + 1);
    }
  });
  return {pos: pos.subarray(0, v * 3), col: col.subarray(0, v * 3), idx: new Uint32Array(idx), mx: mx, my: my, k: k, nTop: nTop, edge: new Uint32Array(edge)};
}
// The wood has been cut some more, in cells i0..i1 by j0..j1: move those points of a mesh already made (and
// the board's sides, if the cut reached one). The mesh is then what woodMesh would make afresh (tested).
// Returns the points changed, {a0, b0, a1, b1, edge (the sides too)}, or null if none.
function woodMeshUpdate(sim, m, i0, j0, i1, j1){
  var k = m.k, mx = m.mx, my = m.my, pos = m.pos, col = m.col;
  var a0 = Math.max(0, Math.floor(i0 / k)), a1 = Math.min(mx - 1, Math.floor(i1 / k)), b0 = Math.max(0, Math.floor(j0 / k)), b1 = Math.min(my - 1, Math.floor(j1 / k));
  if (a1 < a0 || b1 < b0) return null;
  for (var j = b0; j <= b1; j++) for (var i = a0; i <= a1; i++){
    var o = (j * mx + i) * 3, h = woodPatchLow(sim, k, i, j), c = woodColour(sim, h);
    pos[o + 1] = h; col[o] = c[0] / 255; col[o + 1] = c[1] / 255; col[o + 2] = c[2] / 255;
  }
  var atEdge = a0 === 0 || b0 === 0 || a1 === mx - 1 || b1 === my - 1;
  if (atEdge) for (var e = 0; e < m.edge.length; e++) pos[(m.nTop + e * 2) * 3 + 1] = pos[m.edge[e] * 3 + 1];
  return {a0: a0, b0: b0, a1: a1, b1: b1, edge: atEdge};
}
// The top's lighting after points a0..a1 by b0..b1 moved: the direction each point faces (nor, three numbers a
// point), for those points and the ring round them. Worked out as three.js does for the whole mesh: the sum of
// the triangles that meet at the point, each weighing as much as its area. (The board's sides are flat walls:
// they face the same way whatever their height.) Returns the points done, {a0, b0, a1, b1}.
function woodMeshNormals(m, nor, a0, b0, a1, b1){
  var mx = m.mx, my = m.my, pos = m.pos, sx, sy, sz;
  a0 = Math.max(0, a0 - 1); b0 = Math.max(0, b0 - 1); a1 = Math.min(mx - 1, a1 + 1); b1 = Math.min(my - 1, b1 + 1);
  function tri(a, b, c){                                          // (c - b) x (a - b), as three.js has it
    var ux = pos[c * 3] - pos[b * 3], uy = pos[c * 3 + 1] - pos[b * 3 + 1], uz = pos[c * 3 + 2] - pos[b * 3 + 2];
    var vx = pos[a * 3] - pos[b * 3], vy = pos[a * 3 + 1] - pos[b * 3 + 1], vz = pos[a * 3 + 2] - pos[b * 3 + 2];
    sx += uy * vz - uz * vy; sy += uz * vx - ux * vz; sz += ux * vy - uy * vx;
  }
  for (var j = b0; j <= b1; j++) for (var i = a0; i <= a1; i++){
    var v = j * mx + i, R = i + 1 < mx, L = i >= 1, U = j + 1 < my, D = j >= 1;
    sx = sy = sz = 0;
    // each square of the top is two triangles: (a, b, c) and (b, d, c), with a its first corner, b the next along, c and d above them
    if (R && U) tri(v, v + 1, v + mx);
    if (L && U){ tri(v - 1, v, v - 1 + mx); tri(v, v + mx, v - 1 + mx); }
    if (R && D){ tri(v - mx, v - mx + 1, v); tri(v - mx + 1, v + 1, v); }
    if (L && D) tri(v - mx, v, v - 1);
    var len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
    nor[v * 3] = sx / len; nor[v * 3 + 1] = sy / len; nor[v * 3 + 2] = sz / len;
  }
  return {a0: a0, b0: b0, a1: a1, b1: b1};
}
// The bit's outline from its tip up, as [how far from its axis, how high above its tip], to be spun round its
// axis: a flat end, a ball, or a V at its angle with its tip flat. thick: the material's thickness (a V-bit is
// drawn as wide as it could ever cut in it, and the shank stands clear of the top).
function woodBitShape(tool, thick){
  var pts = [[0, 0]];
  if (tool.kind === 'ball'){
    for (var s = 1; s <= 8; s++){ var a = s / 8 * Math.PI / 2; pts.push([tool.r * Math.sin(a), tool.r - tool.r * Math.cos(a)]); }
  } else if (tool.kind === 'v'){
    var tan = Math.tan(tool.half), r = Math.min(tool.r, tool.tip / 2 + (thick + 3) * tan);
    if (tool.tip > 0) pts.push([tool.tip / 2, 0]);
    pts.push([r, (r - tool.tip / 2) / tan]);
  } else pts.push([tool.r, 0]);
  var last = pts[pts.length - 1], top = Math.max(12, thick * 1.5, last[1] + 4);
  pts.push([last[0], top], [0, top]);
  return pts;
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
    woodCubeBuild();
    woodWire3D();
  }
  var W = WOOD3D, m = woodMesh(sim);
  W.m = m;                                                          // kept, to move its points as the cut is played
  if (W.bit){ W.scene.remove(W.bit); W.bit.geometry.dispose(); W.bit = null; }
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
// The wood has been cut some more (wood-play.js): move the block's points to match. d: the cells that changed
// ({i0, j0, i1, j1}), or nothing for all of it. Only the part of the block that changed is sent to the graphics card.
function wood3dCut(job, d){
  var W = WOOD3D, m = W.m, g = W.mesh.geometry;
  var r = d ? woodMeshUpdate(job, m, d.i0, d.j0, d.i1, d.j1) : woodMeshUpdate(job, m, 0, 0, job.nx - 1, job.ny - 1);
  if (!r) return;
  var n = woodMeshNormals(m, g.attributes.normal.array, r.a0, r.b0, r.a1, r.b1);
  var from = n.b0 * m.mx + n.a0, to = n.b1 * m.mx + n.a1;
  ['position', 'color', 'normal'].forEach(function (name){
    var at = g.attributes[name];
    at.updateRange.offset = r.edge ? 0 : from * 3; at.updateRange.count = r.edge ? -1 : (to - from + 1) * 3;
    at.needsUpdate = true;
  });
}
// The bit, where it is: at {x, y, z (its tip), part}; or put away (no place given).
function wood3dBit(job, at){
  var W = WOOD3D;
  if (W.bit && (!at || W.bitPart !== at.part)){ W.scene.remove(W.bit); W.bit.geometry.dispose(); W.bit = null; }
  if (!at) return;
  if (!W.bit){
    var pts = woodBitShape(job.parts[at.part].tool, job.top - job.bottom).map(function (p){ return new THREE.Vector2(p[0], p[1]); });
    W.bit = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshLambertMaterial({color: 0xc9d3de, transparent: true, opacity: 0.82, side: THREE.DoubleSide}));
    W.bitPart = at.part;
    W.scene.add(W.bit);
  }
  W.bit.position.set(at.x, at.z, -at.y);
}
// Draw the block, and the view cube over its corner.
function woodRender3D(){
  var W = WOOD3D;
  if (!W) return;
  W.renderer.render(W.scene, W.camera);
  woodCubeRender();
}
// Put the view back square: 'angled' (from the front left, above), 'top', or 'front'.
function woodView(name){
  var W = WOOD3D;
  if (!W || !W.fit) return;
  var o = W.orbit;
  WOODCUBE.anim = null;
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
  woodRender3D();
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
// Drag to turn, right-drag or Shift+drag to move, scroll to zoom; a click on the view cube looks from there.
function woodWire3D(){
  var W = WOOD3D, el = W.renderer.domElement, drag = null;
  el.addEventListener('contextmenu', function (e){ e.preventDefault(); });
  el.addEventListener('pointerdown', function (e){
    drag = {x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey, cube: e.button === 0 && !!woodCubeHit(e), moved: false};
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', function (e){
    if (!drag){                                                   // over the cube: light the face that a click would go to
      var over = woodCubeHit(e);
      woodCubeHover(over ? over.face.materialIndex : -1);
      el.style.cursor = over ? 'pointer' : '';
      return;
    }
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y, o = W.orbit;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    if (!drag.moved) return;
    WOODCUBE.anim = null;                                         // turning it by hand stops a turn under way
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
  el.addEventListener('pointerup', function (e){
    if (drag && drag.cube && !drag.moved){
      var hit = woodCubeHit(e);
      if (hit){ var v = woodCubeDir(hit.point.x, hit.point.y, hit.point.z); woodViewTo(v.theta, v.phi); }
    }
    drag = null;
  });
  el.addEventListener('pointerleave', function (){ woodCubeHover(-1); });
  el.addEventListener('wheel', function (e){
    e.preventDefault();
    W.orbit.radius = Math.max(1, Math.min(W.fit ? W.fit.size * 10 : 1e5, W.orbit.radius * (e.deltaY > 0 ? 1.12 : 0.89)));
    woodCamera();
  }, {passive: false});
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(woodResize3D).observe(W.host);
}
