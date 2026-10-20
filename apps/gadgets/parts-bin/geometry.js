// The parts bin: a Frame (a tray) and Inserts that fill it, for 3D printing. Clint's TrayConfigurator design in
// SolidCraft (2026-10-17), step for step: the same parameters, the same features, the same order.
//
// Every solid here is a rounded rectangle in plan whose outline steps in at the bottom (a chamfer) or curves in (a
// fillet), so each is convex: it's made as the hull of rounded-rectangle rings at a few heights. The Frame's pocket,
// its sloped stacking rim and its finger notches are cut from it; the Insert's pocket from it.
//
// Plain JavaScript, for the page and for Node's tests alike. M is Manifold (manifold-3d), set up by the caller.

// The design's parameters, as SolidCraft named them, with its values. Lengths in millimetres.
export const DEFAULTS = {
  TrayL: 125,       // Frame: outside length
  TrayW: 24,        // Frame: outside width
  TrayH: 6,         // Frame: wall height, the stacking pitch (12 for the deep version)
  Units: 4,         // slots along the Frame
  Clear: 0.2,       // gap between an insert and the Frame, each side
  Wall: 2,          // Frame walls
  Floor: 1.2,       // Frame floor
  InsWall: 1.2,     // Insert walls and floor
  CornerR: 1.5,     // corner radius, upright corners
  FloorR: 1,        // Insert: rounded edge where the floor meets the walls
  RimH: 1,          // stacking rim: height above the walls
  RimW: 1,          // stacking rim: width at its foot
  RimTop: 0.2,      // stacking rim: width at its top
  BaseCh: 1.4,      // Frame: 45 degree bevel round the bottom, which sits in the rim of the Frame below
  NotchR: 4.5,      // finger notch: radius
  NotchDepth: 2.5,  // finger notch: how far it dips below the top of the walls
  InsCh: 0.4,       // Insert: bevel round the bottom
  notches: true,    // finger notches in the front wall
  rim: true,        // stacking rim (and the bevel underneath that sits in it)
};

// What each is called on the page
export const LABELS = { TrayL: 'Length', TrayW: 'Width', TrayH: 'Wall height', Units: 'Slots', Clear: 'Clearance', Wall: 'Tray walls',
  Floor: 'Tray floor', InsWall: 'Insert walls and floor', CornerR: 'Corner radius', FloorR: 'Insert floor rounding', RimH: 'Rim height',
  RimW: 'Rim width at its foot', RimTop: 'Rim width at its top', BaseCh: 'Bevel under the tray', NotchR: 'Notch radius',
  NotchDepth: 'Notch depth', InsCh: 'Bevel under the inserts' };

// What follows from them (SolidCraft's PocketL, PocketW, Pitch, InsL, InsW, InsH)
export function derived(p) {
  const PocketL = p.TrayL - 2 * p.Wall, PocketW = p.TrayW - 2 * p.Wall, Pitch = PocketL / p.Units;
  return { PocketL, PocketW, Pitch, InsW: PocketW - 2 * p.Clear, InsH: p.TrayH - p.Floor,
           insL: (units) => units * Pitch - 2 * p.Clear };
}

// Why a set of parameters can't make a sound part, in words for the page; [] when it can.
export function problems(p) {
  const d = derived(p), out = [];
  const num = (k) => typeof p[k] === 'number' && isFinite(p[k]);
  for (const k of Object.keys(DEFAULTS)) if (typeof DEFAULTS[k] === 'number' && !num(k)) out.push((LABELS[k] || k) + ' needs a number.');
  if (out.length) return out;
  if (!Number.isInteger(p.Units) || p.Units < 1) out.push('The tray needs at least 1 slot.');
  if (p.Wall <= 0 || p.Floor <= 0 || p.InsWall <= 0) out.push('Walls and floors must be thicker than 0.');
  // an insert's own pocket needs room for its rounded corners and 1 mm more
  const room = 2 * p.Clear + 2 * p.InsWall + 2 * Math.max(0, p.CornerR) + 1;
  if (d.PocketW < room) out.push('The tray is too narrow for its walls and an insert.');
  if (d.Pitch < room) out.push('The slots are too short for an insert: use fewer slots or a longer tray.');
  if (d.InsH <= p.InsWall + 0.5) out.push('The tray is too low for its floor and an insert.');
  if (p.CornerR < 0 || p.CornerR * 2 > Math.min(d.PocketW, d.Pitch) - 2 * p.Clear) out.push('The corner radius is too big for the slots.');
  if (p.CornerR - p.Clear < 0) out.push('The clearance can’t be more than the corner radius.');
  if (p.FloorR < 0 || p.FloorR > p.CornerR) out.push('The insert’s floor rounding can’t be more than the corner radius.');
  if (p.Clear < 0) out.push('The clearance can’t be less than 0.');
  if (p.rim && (p.RimH <= 0 || p.RimW <= p.RimTop || p.RimTop < 0 || p.RimW >= p.Wall)) out.push('The stacking rim must be narrower at the top than at its foot, and narrower than the wall.');
  if (p.rim && (p.BaseCh < 0 || p.BaseCh > Math.min(p.TrayH, p.Wall, p.CornerR))) out.push('The bottom bevel can’t be more than the wall, the corner radius or the tray’s height.');
  if (p.InsCh < 0 || p.InsCh > Math.min(p.InsWall, d.InsH / 2)) out.push('The insert’s bottom bevel is too big.');
  if (p.notches && (p.NotchR <= 0 || p.NotchDepth <= 0 || p.NotchDepth > p.TrayH - p.Floor || p.NotchR * 2 >= d.Pitch)) out.push('The finger notches don’t fit: make them smaller or shallower.');
  return out;
}

// A rounded rectangle's outline, centred on 0: w by h, corner radius r (0 for square corners), seg points per
// quarter circle. Counter-clockwise, as [x, y] pairs.
export function roundedRect(w, h, r, seg) {
  const pts = [], hw = w / 2, hh = h / 2;
  r = Math.max(0, Math.min(r, hw, hh));
  if (r < 1e-9) return [[hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh]];
  const corners = [[hw - r, -hh + r, -Math.PI / 2], [hw - r, hh - r, 0], [-hw + r, hh - r, Math.PI / 2], [-hw + r, -hh + r, Math.PI]];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= seg; i++) { const a = a0 + (Math.PI / 2) * i / seg; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

// A convex solid from rings: [{z, w, h, r}] (each a rounded rectangle at a height), at (x, y).
function rings(M, list, seg, x = 0, y = 0) {
  const pts = [];
  for (const g of list) for (const [px, py] of roundedRect(g.w, g.h, g.r, seg)) pts.push([x + px, y + py, g.z]);
  return M.Manifold.hull(pts);
}
// A rectangle whose outline steps in by inset(t) at height z = z0 + t: the rounded rectangle offset inwards,
// which is what a chamfer or a rolling-ball fillet along it gives (while the inset is at most the corner radius).
const ring = (z, w, h, r, inset) => ({ z, w: w - 2 * inset, h: h - 2 * inset, r: Math.max(0, r - inset) });
// The heights and insets of a fillet of radius f whose foot is at height z0 (inset f) and top at z0 + f (inset 0)
function filletRings(z0, w, h, r, f, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = f * i / steps;                                       // height above the foot
    out.push(ring(z0 + t, w, h, r, f - Math.sqrt(Math.max(0, f * f - (f - t) * (f - t)))));
  }
  return out;
}

// The Frame, its bottom at z = 0, centred on 0 in x and y.
export function frame(M, p, q = {}) {
  const seg = q.seg || 16, d = derived(p), top = p.TrayH + (p.rim ? p.RimH : 0);
  const ch = p.rim ? p.BaseCh : 0;
  // FrameBlock, FrameCorners, StackChamfer: the block with rounded upright corners and the bevel underneath
  let f = rings(M, [ring(0, p.TrayL, p.TrayW, p.CornerR, ch), ring(ch, p.TrayL, p.TrayW, p.CornerR, 0), ring(top, p.TrayL, p.TrayW, p.CornerR, 0)], seg);
  // Pocket, PocketCorners: from the floor up, out through the top
  f = f.subtract(rings(M, [ring(p.Floor, d.PocketL, d.PocketW, p.CornerR, 0), ring(top + 1, d.PocketL, d.PocketW, p.CornerR, 0)], seg));
  if (p.rim) {
    // RimSlope: a square-cornered rectangle RimW in from the outside at the top of the walls, widening as it rises,
    // so the rim is RimW wide at its foot and RimTop at its top (cut on past the top, at the same slope)
    const grow = (p.RimW - p.RimTop) / p.RimH, w0 = p.TrayL - 2 * p.RimW, h0 = p.TrayW - 2 * p.RimW, up = p.RimH + 1;
    f = f.subtract(rings(M, [{ z: p.TrayH, w: w0, h: h0, r: 0 }, { z: p.TrayH + up, w: w0 + 2 * grow * up, h: h0 + 2 * grow * up, r: 0 }], seg));
  }
  if (p.notches) {
    // Notch, and its pattern: a cylinder across the front wall, one per slot, dipping NotchDepth below the wall top
    const zc = p.TrayH - p.NotchDepth + p.NotchR, len = p.Wall + 2, segC = Math.max(32, seg * 4);
    const cuts = [];
    for (let k = 0; k < p.Units; k++) {
      const x = -d.PocketL / 2 + d.Pitch / 2 + k * d.Pitch;
      cuts.push(M.Manifold.cylinder(len, p.NotchR, p.NotchR, segC).rotate([-90, 0, 0]).translate([x, -p.TrayW / 2 - 1, zc]));
    }
    f = f.subtract(M.Manifold.union(cuts));
  }
  return f;
}

// Everything to print, laid out on the build plate: the Frame (frames of them), then the inserts in rows behind it,
// gap mm apart, each row no longer than the Frame. order: { frames, inserts: { [units]: count } }.
// Returns [{ name, kind, solid, x, y }], x and y the centre of each part's outline.
export function partsFor(M, p, order, q = {}) {
  const d = derived(p), gap = q.gap || 5, out = [];
  let y = 0;
  // kind: the same for parts of the same shape (one STL each kind); a shape is made once and used for each copy
  const trayKind = 'Tray ' + p.Units + (p.Units === 1 ? ' slot' : ' slots'), made1 = {};
  for (let i = 0; i < (order.frames || 0); i++) {
    made1.tray = made1.tray || frame(M, p, q);
    out.push({ name: trayKind + (order.frames > 1 ? ' (' + (i + 1) + ')' : ''), kind: trayKind, solid: made1.tray, x: 0, y }); y += p.TrayW + gap;
  }
  const row = [];
  for (const u of Object.keys(order.inserts || {}).map(Number).sort((a, b) => b - a))
    for (let i = 0; i < order.inserts[u]; i++) row.push(u);
  let x = -p.TrayL / 2, made = {};
  for (const u of row) {
    const L = d.insL(u);
    if (x > -p.TrayL / 2 && x + L > p.TrayL / 2) { x = -p.TrayL / 2; y += d.InsW + gap; }
    made[u] = (made[u] || 0) + 1;
    made1[u] = made1[u] || insert(M, p, u, q);
    out.push({ name: 'Insert ' + u + (u === 1 ? ' slot' : ' slots') + ' (' + made[u] + ')', kind: 'Insert ' + u + (u === 1 ? ' slot' : ' slots'), solid: made1[u], x: x + L / 2, y, units: u });
    x += L + gap;
  }
  return out;
}

// An Insert `units` slots long, its bottom at z = 0, centred on 0.
export function insert(M, p, units, q = {}) {
  const seg = q.seg || 16, d = derived(p), L = d.insL(units), W = d.InsW, H = d.InsH;
  // InsCorners: concentric with the Frame's pocket (q.outerR: the radius it had before, for checking against that)
  const R = q.outerR !== undefined ? q.outerR : p.CornerR - p.Clear;
  // InsBlock, InsCorners, InsBottomChamfer
  let s = rings(M, [ring(0, L, W, R, p.InsCh), ring(p.InsCh, L, W, R, 0), ring(H, L, W, R, 0)], seg);
  // InsPocket, InsPocketCorners, InsFloorFillet: from the floor up, its bottom edge rounded
  const pl = L - 2 * p.InsWall, pw = W - 2 * p.InsWall;
  const fl = p.FloorR > 0 ? filletRings(p.InsWall, pl, pw, p.CornerR, p.FloorR, q.filletSteps || 12) : [ring(p.InsWall, pl, pw, p.CornerR, 0)];
  s = s.subtract(rings(M, fl.concat([ring(H + 1, pl, pw, p.CornerR, 0)]), seg));
  return s;
}
