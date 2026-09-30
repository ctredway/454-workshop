/* ---------------- numeric entry parsing ---------------- */
/* Accepted while a point is expected:
   "50,30"   absolute point
   "@10,0"   relative to previous point (or to first point of the op)
   "D5" / "d5"  circle diameter (circle tool, radius stage)
   "R2.5"    circle radius
   plain "12" during guide offset = distance (sign flips side: negative = other side)
   rect second stage: "120,80" = W,H relative to first corner (positive right/up) */
function parseNumericPoint(str, ref){
  str = str.trim();
  var rel = false;
  if (str[0] === '@'){ rel = true; str = str.slice(1); }
  var pol = str.split('<');
  if (pol.length === 2 && ref){
    var len = lenIn(pol[0]), ang = parseFloat(pol[1]) * Math.PI / 180;   // length in units, angle in degrees
    if (!isNaN(len) && !isNaN(ang))
      return {x: ref.x + len*Math.cos(ang), y: ref.y + len*Math.sin(ang)};
    return null;
  }
  var m = str.split(',');
  if (m.length !== 2) return null;
  var a = lenIn(m[0]), b = lenIn(m[1]);
  if (isNaN(a) || isNaN(b)) return null;
  if (rel && ref) return {x:ref.x + a, y:ref.y + b};
  if (rel) return null;
  return {x:a, y:b};
}

/* ---------------- tool state machine ---------------- */
var STAGE_LABEL = {
  line0:  'Line \u2014 click first point, or type "x,y"',
  measure0:'Measure \u2014 click two points for distance and angle \u00b7 Shift-click two shapes for the gap between them',
  measure1:'Measure \u2014 click the second point',
  measureS:'Measure \u2014 Shift-click the second shape',
  text0:  'Text \u2014 click where the text should start (its baseline), or click existing text to edit it',
  line1:  'Line \u2014 next point: "x,y" abs \u00b7 "@dx,dy" rel \u00b7 "50<45" length<angle\u00b0',
  rect0:  'Rect \u2014 click first corner, or type "x,y"',
  rect1:  'Rect \u2014 opposite corner, or type "W,H" e.g. "120,80"',
  circle0:'Circle \u2014 click center, or type "x,y"',
  circle1:'Circle \u2014 click radius point, or type "D5" / "R2.5"',
  ellipse0:'Ellipse — click the centre, or type "x,y"',
  ellipse1:'Ellipse — click a corner of its box, or type its width and height, e.g. "120,60"',
  polygon0:'Polygon — {S} sides (type S8 for 8) · click the centre, or type "x,y"',
  polygon1:'Polygon — {S} sides · click a corner, or type R40 to the corners, D80 across them, F70 across the flats',
  star0:  'Star — {P} points (type S6 for 6) · click the centre, or type "x,y"',
  star1:  'Star — {P} points · click the tip of a point, or type R40 (a point straight up)',
  star2:  'Star — click where the inner corners go, or type their radius, e.g. 15',
  poly0:  'Polyline \u2014 click first point, or type "x,y"',
  poly1:  'Polyline \u2014 next point ("@dx,dy" / "50<45" ok) \u00b7 Enter finishes \u00b7 click start closes',
  offset0:'Offset \u2014 select or click shapes, then type the distance: "+2" outward copy, "-1.5" inward',
  copy0:  'Copy \u2014 click base point, or type the offset "@dx,dy"',
  copy1:  'Copy \u2014 click destination, or type "x,y" / "@dx,dy"',
  mirror0:'Mirror \u2014 click the shapes to mirror, then the line to mirror about \u00b7 a construction line (X) is taken as the axis automatically',
  mirror1:'Mirror \u2014 click the second point of the axis (mirrored copy)',
  rotate0:'Rotate \u2014 click the rotation center, or type "x,y"',
  rotate1:'Rotate \u2014 type the angle in degrees (+ CCW, \u2212 CW)',
  array0: 'Array \u2014 type "N@dx,dy" (linear, e.g. 5@12,0), or click a center for a circular array',
  array1: 'Array \u2014 type "N<step\u00b0" (e.g. 6<60) around the clicked center',
  selFirst:'Select something first \u2014 press V, click entities (shift adds), then pick the transform',
  fillet0:'Fillet \u2014 radius R{R} \u00b7 click a corner (poly/rect corner, or two meeting lines) \u00b7 type a new radius anytime \u00b7 click a rounded corner to make it sharp again',
  fillet0dog:'Dog-bone \u2014 bit radius {R} (\u00d8{D} bit) \u00b7 click a corner to relieve it so a square part fits \u00b7 type a new radius anytime \u00b7 click a rounded corner to make it sharp again',
  fillet0t:'T-bone \u2014 bit radius {R} (\u00d8{D} bit) \u00b7 click a corner, nearer the edge the relief should cut into \u00b7 type a new radius anytime \u00b7 click a rounded corner to make it sharp again',
  trim0:  'Trim \u2014 click the piece to remove (lines, arcs, circles); crossings bound the cut',
  extend0:'Extend \u2014 click near the end of a line or arc to run it to the next crossing',
  node0:  'Edit nodes \u2014 click a polyline or path to show its points',
  dim0:   'Dimension \u2014 click a shape, then another, to set the distance between them \u00b7 click one shape twice for its own size \u00b7 click an existing value to change it',
  dim1:   'Dimension \u2014 now click what to measure it TO; that one stays put (or the same shape again for its own size)',
  dimEditV:'Distance \u2014 type the value and press Enter; the FIRST shape you clicked moves \u00b7 prefix E for edge-to-edge',
  dimEditS:'Size \u2014 type the value and press Enter; the shape resizes',
  node1:  'Edit nodes \u2014 drag a point to move it \u00b7 click a point to type exact X,Y \u00b7 click a segment to type its length \u00b7 Esc when done',
  nodeXY: 'Point \u2014 type exact "x,y"',
  nodeLen:'Segment \u2014 type its length (the later point moves along the segment direction)',
  editMiss:'Nothing there \u2014 click a corner (fillet) or a line/arc/circle (trim, extend)',
  filletFit:'Fillet didn\u2019t fit \u2014 radius too large for those legs (type a smaller radius), or the spans meet tangentially',
  filletBadR:'Radius must be a positive number \u2014 e.g. type 3 for a 3\u00a0mm fillet',
  arc0:   'Arc \u2014 click start point, or type "x,y"',
  arc1:   'Arc \u2014 click end point, or type "x,y" / "@dx,dy" / "10<45"',
  arc2:   'Arc \u2014 move to bow the arc, click to place \u00b7 or type radius ("+" bows left of start\u2192end, "\u2212" right)',
  guide0: 'Guide \u2014 click an edge (stock or drawing) to offset from',
  guideOffset: 'Guide \u2014 offset from that edge in mm (negative = other side)'
};
function stagePrompt(key){
  if (key === 'fillet0' && UICFG.filletType === 'dogbone') key = 'fillet0dog';
  if (key === 'fillet0' && UICFG.filletType === 'tbone') key = 'fillet0t';
  var txt = STAGE_LABEL[key] || '';
  if (txt.indexOf('{R}') >= 0) txt = txt.replace('{R}', UICFG.filletR);
  if (txt.indexOf('{S}') >= 0) txt = txt.replace(/\{S\}/g, shapeSides());
  if (txt.indexOf('{P}') >= 0) txt = txt.replace(/\{P\}/g, shapePoints());
  if (txt.indexOf('{D}') >= 0) txt = txt.replace('{D}', +(UICFG.filletR * 2).toFixed(3));
  showPrompt(txt, '');
}
