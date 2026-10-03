/* ---------------- Preview in wood: the view cube ----------------
   A small cube in the top right corner of the 3D view, turning with the block, as in 454 Control's preview. Click
   a face (Top, Front, Right...), an edge or a corner to look from there; drag anywhere to turn the block freely.
   It works while the cut is playing. The view never goes below the board, so Bottom gives the lowest side view.
   woodCubeAt and woodCubeDir are plain functions (tested on their own); the rest needs three.js. */
var WOODCUBE = {px: 92, pad: 10, half: 0.8, scene: null, camera: null, mesh: null, mats: [], hover: -1, ray: null, anim: null,
                labels: ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back']};   // three.js's order for a box's faces: +x, -x, +y, -y, +z, -z

// Where on the cube's square a point of the 3D view is: {x, y} from -1 to 1 (y up), or null if it's outside the
// square. (x, y): from the view's top left corner; w: the view's width.
function woodCubeAt(x, y, w){
  var C = WOODCUBE, left = w - C.px - C.pad, top = C.pad;
  if (x < left || x > left + C.px || y < top || y > top + C.px) return null;
  return {x: (x - left) / C.px * 2 - 1, y: -((y - top) / C.px * 2 - 1)};
}
// The view for a click on the cube at point (px, py, pz) of its surface: near a corner or an edge the view is
// from that corner or edge, otherwise square on to the face. (A point on its surface is always half the cube's
// width from the middle one way, so it always says a direction.) Returns the camera's {theta, phi}, kept above
// the board as dragging keeps it.
function woodCubeDir(px, py, pz){
  var lim = WOODCUBE.half * 0.45;
  var dx = Math.abs(px) > lim ? (px > 0 ? 1 : -1) : 0, dy = Math.abs(py) > lim ? (py > 0 ? 1 : -1) : 0, dz = Math.abs(pz) > lim ? (pz > 0 ? 1 : -1) : 0;
  var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  var phi = Math.acos(Math.max(-1, Math.min(1, dy / len)));
  return {theta: dx || dz ? Math.atan2(dx, dz) : 0, phi: Math.min(Math.PI / 2 - 0.02, Math.max(0.001, phi))};
}
function woodCubeFace(label, hot){
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var g = c.getContext('2d');
  g.fillStyle = hot ? '#3a2f18' : '#1f262f'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = hot ? '#e8a33d' : '#39434f'; g.lineWidth = 5; g.strokeRect(3, 3, 122, 122);
  g.fillStyle = hot ? '#ffc96b' : '#93a0ad';
  g.font = '600 25px Archivo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 64, 66);
  var t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
function woodCubeBuild(){
  var C = WOODCUBE;
  if (C.scene) return;
  C.scene = new THREE.Scene();
  C.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  C.ray = new THREE.Raycaster();
  C.mats = C.labels.map(function (l){ return new THREE.MeshBasicMaterial({map: woodCubeFace(l, false)}); });
  C.mesh = new THREE.Mesh(new THREE.BoxGeometry(C.half * 2, C.half * 2, C.half * 2), C.mats);
  C.scene.add(C.mesh);
  C.scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(C.mesh.geometry), new THREE.LineBasicMaterial({color: 0x5a6673})));
  // the labels again once the app's font is in
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function (){ for (var i = 0; i < 6; i++) woodCubeRefresh(i); woodRender3D(); });
}
function woodCubeRefresh(i){
  var C = WOODCUBE, old = C.mats[i].map;
  C.mats[i].map = woodCubeFace(C.labels[i], i === C.hover);
  C.mats[i].needsUpdate = true;
  if (old) old.dispose();
}
function woodCubeHover(i){
  var C = WOODCUBE, was = C.hover;
  if (i === was) return;
  C.hover = i;
  if (was >= 0) woodCubeRefresh(was);
  if (i >= 0) woodCubeRefresh(i);
  woodRender3D();
}
// What of the cube is under the pointer: three.js's hit (its point, and its face), or null.
function woodCubeHit(e){
  var W = WOOD3D, C = WOODCUBE;
  if (!W || !C.scene) return null;
  var r = W.renderer.domElement.getBoundingClientRect(), nd = woodCubeAt(e.clientX - r.left, e.clientY - r.top, W.host.clientWidth);
  if (!nd) return null;
  C.ray.setFromCamera(nd, C.camera);
  var hits = C.ray.intersectObject(C.mesh);
  return hits.length ? hits[0] : null;
}
// Turn the view to (theta, phi), the short way round, over a quarter of a second (at once with reduced motion).
function woodViewTo(theta, phi){
  var W = WOOD3D, o = W.orbit, C = WOODCUBE, d = theta - o.theta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  C.anim = {t0: performance.now(), dur: still ? 0 : 260, fromT: o.theta, fromP: o.phi, toT: o.theta + d, toP: phi};
  (function step(){
    var a = C.anim;
    if (!a || !WOOD3D) return;
    var u = a.dur ? Math.min(1, (performance.now() - a.t0) / a.dur) : 1, s = u * u * (3 - 2 * u);
    o.theta = a.fromT + (a.toT - a.fromT) * s; o.phi = a.fromP + (a.toP - a.fromP) * s;
    woodCamera();
    if (u < 1) requestAnimationFrame(step); else C.anim = null;
  })();
}
// Draw the cube over the corner of the view just drawn, turned as the block is.
function woodCubeRender(){
  var W = WOOD3D, C = WOODCUBE;
  if (!C.scene) return;
  var w = W.host.clientWidth, h = W.host.clientHeight, o = W.orbit, r = 4.4, left = w - C.px - C.pad, gy = h - C.pad - C.px;   // from the bottom, as the graphics card counts
  C.camera.position.set(r * Math.sin(o.phi) * Math.sin(o.theta), r * Math.cos(o.phi), r * Math.sin(o.phi) * Math.cos(o.theta));
  C.camera.up.set(0, 1, 0);
  if (o.phi < 0.01) C.camera.up.set(0, 0, -1);                  // straight down: as the block's camera turns
  C.camera.lookAt(0, 0, 0);
  var R = W.renderer, was = R.autoClear;
  R.setViewport(left, gy, C.px, C.px); R.setScissor(left, gy, C.px, C.px); R.setScissorTest(true);
  R.autoClear = false;                                          // keep the block's picture: the cube floats over it
  R.clearDepth();
  R.render(C.scene, C.camera);
  R.autoClear = was; R.setScissorTest(false); R.setViewport(0, 0, w, h);
}
