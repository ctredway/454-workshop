/* ============================================================
   THREE.js viewer
   ============================================================ */
var scene, camera, renderer3, viewportEl;
var cutLine=null, rapidLine=null, marker=null, gridObj=null, axesObj=null, envObj=null, originObj=null;
var cutColors=null, rapidColors=null;
var C_CUT=[0.722,0.498,0.180], C_CUT_D=[1.0,0.788,0.42], C_RAP=[0.275,0.345,0.42], C_RAP_D=[0.498,0.639,0.769];
// Colours for the 3D view, per theme. On dark, what's been cut turns brighter; on light it turns
// darker and stronger instead, so it stands out against the background either way.
function viewPal(){
  return UITHEME && UITHEME.theme === 'light'
    ? {gridMinor: 0xdde3e9, gridMajor: 0xc6cfd8, cut: [0.851,0.600,0.310], cutDone: [0.620,0.310,0.000],
       rap: [0.690,0.745,0.800], rapDone: [0.255,0.420,0.600]}
    : {gridMinor: 0x20262e, gridMajor: 0x2e3742, cut: [0.722,0.498,0.180], cutDone: [1.0,0.788,0.42],
       rap: [0.275,0.345,0.42], rapDone: [0.498,0.639,0.769]};
}
function applyViewPal(){
  var v = viewPal();
  C_CUT = v.cut; C_CUT_D = v.cutDone; C_RAP = v.rap; C_RAP_D = v.rapDone;
}
var orbit = {theta: -Math.PI/4, phi: Math.PI/3.2, radius: 400, target: new THREE.Vector3(0,0,0)};

function w3(x,y,z){ return new THREE.Vector3(x, z, -y); } // CNC -> three

function initThree(){
  applyViewPal();                                      // start in the saved theme's colours
  viewportEl = document.getElementById('viewport');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(cssNum('--bg', 0x14181d));
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50000);
  renderer3 = new THREE.WebGLRenderer({antialias:true});
  renderer3.setPixelRatio(window.devicePixelRatio || 1);
  viewportEl.appendChild(renderer3.domElement);

  buildStage();
  buildViewCube();

  var el = renderer3.domElement;
  var drag = null;
  el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  el.addEventListener('pointerdown', function(e){
    drag = {btn: e.button, x: e.clientX, y: e.clientY, shift: e.shiftKey,
            cube: !!inCube(e), moved: false};
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', function(e){
    if (!drag){
      // hover highlight on the view cube
      var nd = inCube(e);
      var hit = nd ? cubePick(nd) : null;
      setCubeHover(hit ? hit.face.materialIndex : -1);
      el.style.cursor = hit ? 'pointer' : '';
      return;
    }
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    drag.x = e.clientX; drag.y = e.clientY;
    VIEWANIM = null; // manual input cancels an animated transition
    if (drag.btn === 0 && !drag.shift){
      orbit.theta -= dx * 0.006;
      orbit.phi = Math.min(Math.PI - 0.05, Math.max(0.05, orbit.phi - dy * 0.006));
    } else {
      var k = orbit.radius * 0.0016;
      var right = new THREE.Vector3(); camera.getWorldDirection(right);
      var dir = right.clone();
      right.cross(camera.up).normalize();
      var up = right.clone().cross(dir).normalize().negate();
      orbit.target.addScaledVector(right, -dx * k);
      orbit.target.addScaledVector(up, -dy * k);
    }
    applyCamera();
  });
  el.addEventListener('pointerup', function(e){
    if (drag && drag.cube && !drag.moved){
      var nd = inCube(e);
      var hit = nd ? cubePick(nd) : null;
      if (hit) cubeGoto(hit);
    }
    drag = null;
  });
  el.addEventListener('pointerleave', function(){ setCubeHover(-1); });
  el.addEventListener('wheel', function(e){
    e.preventDefault();
    VIEWANIM = null; // zooming cancels an animated transition, as dragging does
    orbit.radius *= (e.deltaY > 0 ? 1.12 : 0.89);
    orbit.radius = Math.max(5, Math.min(30000, orbit.radius));
    applyCamera();
  }, {passive:false});

  function resize(){
    var w = viewportEl.clientWidth, h = viewportEl.clientHeight;
    if (!w || !h) return;
    renderer3.setSize(w, h);
    camera.aspect = w/h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(viewportEl);
  resize();
  applyCamera();
  (function loop(){
    requestAnimationFrame(loop);
    tick();
    var w = viewportEl.clientWidth, h = viewportEl.clientHeight;
    renderer3.setViewport(0, 0, w, h);
    renderer3.setScissorTest(false);
    renderer3.render(scene, camera);
    renderViewCube(w, h);
  })();
}

function applyCamera(){
  var t = orbit.target;
  camera.position.set(
    t.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    t.y + orbit.radius * Math.cos(orbit.phi),
    t.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
  );
  camera.lookAt(t);
}

/* ---------------- view cube ---------------- */
var CUBE = {px:96, pad:10, scene:null, camera:null, mesh:null, mats:[], hover:-1,
            labels:['Right','Left','Top','Bottom','Front','Back'], // three.js box material order: +x,-x,+y,-y,+z,-z
            ray:null};
var VIEWANIM = null;

function makeFaceTex(label, hot){
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
function buildViewCube(){
  CUBE.scene = new THREE.Scene();
  CUBE.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  CUBE.ray = new THREE.Raycaster();
  for (var i = 0; i < 6; i++){
    CUBE.mats.push(new THREE.MeshBasicMaterial({map: makeFaceTex(CUBE.labels[i], false)}));
  }
  CUBE.mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), CUBE.mats);
  CUBE.scene.add(CUBE.mesh);
  CUBE.scene.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(CUBE.mesh.geometry),
    new THREE.LineBasicMaterial({color: 0x5a6673})
  ));
  // redraw labels once the webfont is in
  if (document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){ for (var i = 0; i < 6; i++) refreshFace(i); });
  }
}
function refreshFace(i){
  var old = CUBE.mats[i].map;
  CUBE.mats[i].map = makeFaceTex(CUBE.labels[i], i === CUBE.hover);
  CUBE.mats[i].needsUpdate = true;
  if (old) old.dispose();
}
function setCubeHover(idx){
  if (idx === CUBE.hover) return;
  var prev = CUBE.hover;
  CUBE.hover = idx;
  if (prev >= 0) refreshFace(prev);
  if (idx >= 0) refreshFace(idx);
}
function cubeRect(){
  var w = viewportEl.clientWidth;
  return {x: w - CUBE.px - CUBE.pad, y: CUBE.pad, s: CUBE.px};
}
function inCube(e){
  var r = renderer3.domElement.getBoundingClientRect();
  var cr = cubeRect();
  var x = e.clientX - r.left, y = e.clientY - r.top;
  if (x < cr.x || x > cr.x + cr.s || y < cr.y || y > cr.y + cr.s) return null;
  return {x: ((x - cr.x) / cr.s) * 2 - 1, y: -(((y - cr.y) / cr.s) * 2 - 1)};
}
function cubePick(nd){
  CUBE.ray.setFromCamera(nd, CUBE.camera);
  var hits = CUBE.ray.intersectObject(CUBE.mesh);
  return hits.length ? hits[0] : null;
}
function cubeGoto(hit){
  // snap the hit point to a face / edge / corner direction
  var p = hit.point, h = 0.8, t = 0.45;
  var d = new THREE.Vector3(
    Math.abs(p.x) > h * t ? Math.sign(p.x) : 0,
    Math.abs(p.y) > h * t ? Math.sign(p.y) : 0,
    Math.abs(p.z) > h * t ? Math.sign(p.z) : 0
  );
  if (d.lengthSq() === 0){
    var n = hit.face.normal;
    d.set(Math.round(n.x), Math.round(n.y), Math.round(n.z));
  }
  d.normalize();
  var theta = Math.atan2(d.x, d.z);
  var phi = Math.acos(Math.max(-1, Math.min(1, d.y)));
  phi = Math.min(Math.PI - 0.02, Math.max(0.02, phi));
  animateView(theta, phi);
}
function animateView(theta, phi, opts){
  // Turn the camera to (theta, phi); opts can also move what it looks at (target), how far away it is
  // (radius), and take longer (dur, ms). With reduced motion it goes straight there.
  opts = opts || {};
  // take the short way around
  var d = theta - orbit.theta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  VIEWANIM = {t0: performance.now(), dur: opts.dur || 260,
              fromT: orbit.theta, fromP: orbit.phi,
              toT: orbit.theta + d, toP: phi,
              fromTarget: opts.target ? orbit.target.clone() : null, toTarget: opts.target || null,
              fromR: orbit.radius, toR: opts.radius !== undefined ? opts.radius : null};
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) VIEWANIM.dur = 0;
}
function renderViewCube(w, h){
  var cr = cubeRect();
  // camera mirrors the main orbit at a fixed radius
  var r = 4.4;
  CUBE.camera.position.set(
    r * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    r * Math.cos(orbit.phi),
    r * Math.sin(orbit.phi) * Math.cos(orbit.theta)
  );
  CUBE.camera.lookAt(0, 0, 0);
  var gy = h - cr.y - cr.s; // CSS top-left -> GL bottom-left
  renderer3.setViewport(cr.x, gy, cr.s, cr.s);
  renderer3.setScissor(cr.x, gy, cr.s, cr.s);
  renderer3.setScissorTest(true);
  var prevAuto = renderer3.autoClear;
  renderer3.autoClear = false;   // keep the scene's pixels — the cube floats over them
  renderer3.clearDepth();        // but never z-fights with the toolpath
  renderer3.render(CUBE.scene, CUBE.camera);
  renderer3.autoClear = prevAuto;
  renderer3.setScissorTest(false);
  renderer3.setViewport(0, 0, w, h);
}

// Show which list entry the current work area is: automatic, a named machine, or custom.
function syncPresetList(){
  var sel = document.getElementById('machinePreset');
  if (!sel) return;
  if (!PROFILE.view.envUser){ sel.value = 'ctl'; return; }
  var key = (+document.getElementById('envW').value) + ',' + (+document.getElementById('envD').value);
  var match = Array.prototype.some.call(sel.options || [], function (o) { return o.value === key; });
  sel.value = match ? key : '';
}
function buildStage(){
  if (gridObj){
    scene.remove(gridObj);
    gridObj.children.forEach(function(ch){ if (ch.geometry) ch.geometry.dispose(); });
  }
  if (axesObj){ scene.remove(axesObj); }
  // the grid IS the machine work area, placed per the job-zero setting
  var c = cfg();
  var x0 = c.origin === 'center' ? -c.w/2 : 0;
  var y0 = c.origin === 'center' ? -c.d/2 : 0;
  var x1 = x0 + c.w, y1 = y0 + c.d;

  gridObj = new THREE.Group();
  var minor = [], major = [];
  function gridLine(arr, ax, ay, bx, by){
    var a = w3(ax, ay, 0), b = w3(bx, by, 0);
    arr.push(a.x, -0.02, a.z, b.x, -0.02, b.z);
  }
  // cells measured from the table edge (x0,y0), so the grid always sits
  // flush with the work-area boundary regardless of where job zero is
  var nx = Math.floor(c.w / 10), ny = Math.floor(c.d / 10);
  for (var ix = 0; ix <= nx; ix++){
    gridLine(ix % 5 === 0 ? major : minor, x0 + ix*10, y0, x0 + ix*10, y1);
  }
  for (var iy = 0; iy <= ny; iy++){
    gridLine(iy % 5 === 0 ? major : minor, x0, y0 + iy*10, x1, y0 + iy*10);
  }
  // always include the four edges so the table boundary is unmistakable
  gridLine(major, x0, y0, x1, y0); gridLine(major, x1, y0, x1, y1);
  gridLine(major, x1, y1, x0, y1); gridLine(major, x0, y1, x0, y0);
  function addLines(arr, col){
    if (!arr.length) return;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    gridObj.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({color: col})));
  }
  var vp = viewPal();
  addLines(minor, vp.gridMinor);
  addLines(major, vp.gridMajor);
  scene.add(gridObj);

  axesObj = new THREE.Group();
  var al = Math.max(30, Math.min(c.w, c.d) * 0.12);
  function axis(v, col){
    var g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), v]);
    axesObj.add(new THREE.Line(g, new THREE.LineBasicMaterial({color:col})));
  }
  axis(w3(al,0,0), 0xe05656);
  axis(w3(0,al,0), 0x5fae5f);
  axis(w3(0,0,al), 0x5f7fd8);
  var oGeom = new THREE.SphereGeometry(Math.max(1, Math.min(c.w, c.d) * 0.006), 12, 12);
  originDot = new THREE.Mesh(oGeom, new THREE.MeshBasicMaterial({color: cssNum('--amber', 0xe8a33d)}));
  axesObj.add(originDot);
  scene.add(axesObj);
}

function buildEnvelope(){
  if (envObj){ scene.remove(envObj); envObj = null; }
  if (!cfg().showEnvelope) return;
  var c = cfg();
  var x0 = c.origin === 'center' ? -c.w/2 : 0;
  var y0 = c.origin === 'center' ? -c.d/2 : 0;
  var pts = [
    w3(x0, y0, 0), w3(x0+c.w, y0, 0),
    w3(x0+c.w, y0, 0), w3(x0+c.w, y0+c.d, 0),
    w3(x0+c.w, y0+c.d, 0), w3(x0, y0+c.d, 0),
    w3(x0, y0+c.d, 0), w3(x0, y0, 0)
  ];
  var g = new THREE.BufferGeometry().setFromPoints(pts);
  envObj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color:0x51617a}));
  scene.add(envObj);
}

function buildToolpath(model){
  if (cutLine){ scene.remove(cutLine); cutLine.geometry.dispose(); cutLine = null; }
  if (rapidLine){ scene.remove(rapidLine); rapidLine.geometry.dispose(); rapidLine = null; }
  if (marker){ scene.remove(marker); marker = null; }
  if (!model || !model.segs.length) return;

  var cutPos = [], rapPos = [];
  for (var i=0;i<model.segs.length;i++){
    var s = model.segs[i];
    var a = w3(s.x0,s.y0,s.z0), b = w3(s.x1,s.y1,s.z1);
    if (s.rapid){ s.g = 1; s.v = rapPos.length/3; rapPos.push(a.x,a.y,a.z,b.x,b.y,b.z); }
    else        { s.g = 0; s.v = cutPos.length/3; cutPos.push(a.x,a.y,a.z,b.x,b.y,b.z); }
  }
  cutColors = new Float32Array(cutPos.length);
  rapidColors = new Float32Array(rapPos.length);
  for (var c=0;c<cutColors.length;c+=3){ cutColors[c]=C_CUT[0]; cutColors[c+1]=C_CUT[1]; cutColors[c+2]=C_CUT[2]; }
  for (var r=0;r<rapidColors.length;r+=3){ rapidColors[r]=C_RAP[0]; rapidColors[r+1]=C_RAP[1]; rapidColors[r+2]=C_RAP[2]; }

  var cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cutPos, 3));
  cg.setAttribute('color', new THREE.BufferAttribute(cutColors, 3));
  cutLine = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({vertexColors:true}));
  scene.add(cutLine);

  var rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rapPos, 3));
  rg.setAttribute('color', new THREE.BufferAttribute(rapidColors, 3));
  rapidLine = new THREE.LineSegments(rg, new THREE.LineDashedMaterial({vertexColors:true, dashSize:2.4, gapSize:1.8}));
  rapidLine.computeLineDistances();
  rapidLine.visible = document.getElementById('showRapids').checked;
  scene.add(rapidLine);

  // marker: cone, tip down, plus ring
  var bb = modelBBox(model);
  var scale = Math.max(bb.dim/70, 0.8);
  var mk = new THREE.Group();
  var cone = new THREE.Mesh(new THREE.ConeGeometry(1.4*scale, 4.5*scale, 20),
                            new THREE.MeshBasicMaterial({color:0xff5544}));
  cone.rotation.x = Math.PI;
  cone.position.y = 2.25*scale;
  mk.add(cone);
  var ring = new THREE.Mesh(new THREE.RingGeometry(1.8*scale, 2.2*scale, 24),
                            new THREE.MeshBasicMaterial({color:0xff5544, side:THREE.DoubleSide, transparent:true, opacity:0.6}));
  ring.rotation.x = -Math.PI/2;
  mk.add(ring);
  marker = mk;
  scene.add(marker);
  marker.position.copy(w3(model.segs[0].x0, model.segs[0].y0, model.segs[0].z0));
}

function modelBBox(model){
  var min={x:1e9,y:1e9,z:1e9}, max={x:-1e9,y:-1e9,z:-1e9};
  var cmin={x:1e9,y:1e9,z:1e9}, cmax={x:-1e9,y:-1e9,z:-1e9};
  for (var i=0;i<model.segs.length;i++){
    var s = model.segs[i];
    var pts = [[s.x0,s.y0,s.z0],[s.x1,s.y1,s.z1]];
    for (var p=0;p<2;p++){
      var v = pts[p];
      if (v[0]<min.x)min.x=v[0]; if (v[0]>max.x)max.x=v[0];
      if (v[1]<min.y)min.y=v[1]; if (v[1]>max.y)max.y=v[1];
      if (v[2]<min.z)min.z=v[2]; if (v[2]>max.z)max.z=v[2];
      if (!s.rapid){
        if (v[0]<cmin.x)cmin.x=v[0]; if (v[0]>cmax.x)cmax.x=v[0];
        if (v[1]<cmin.y)cmin.y=v[1]; if (v[1]>cmax.y)cmax.y=v[1];
        if (v[2]<cmin.z)cmin.z=v[2]; if (v[2]>cmax.z)cmax.z=v[2];
      }
    }
  }
  if (min.x > max.x){ min={x:0,y:0,z:0}; max={x:0,y:0,z:0}; }
  if (cmin.x > cmax.x){ cmin=min; cmax=max; }
  var dim = Math.max(max.x-min.x, max.y-min.y, max.z-min.z, 10);
  return {min:min, max:max, cmin:cmin, cmax:cmax, dim:dim,
          cx:(min.x+max.x)/2, cy:(min.y+max.y)/2, cz:(min.z+max.z)/2};
}

// where the camera looks, and how far away it is, to frame the whole job
function fitFrame(){
  var bb = modelBBox(MODEL);
  return {target: w3(bb.cx, bb.cy, bb.cz), radius: bb.dim * 1.7 + 20};
}
function fitView(){
  if (!MODEL || !MODEL.segs.length) return;
  var f = fitFrame();
  orbit.target.copy(f.target);
  orbit.radius = f.radius;
  applyCamera();
}
// A newly loaded job: frame it, and turn to look straight down on it (the view cube's Top: X to the
// right, Y away from you), animated from wherever the view was.
function showJobFromTop(){
  if (!MODEL || !MODEL.segs.length) return;
  var f = fitFrame();
  animateView(0, 0.02, {target: f.target, radius: f.radius, dur: 700});
}

