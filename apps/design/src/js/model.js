/* ============================================================
   454 Design — geometry model
   Entities: {t:'line',x1,y1,x2,y2} {t:'circle',cx,cy,r}
             {t:'rect',x,y,w,h}   {t:'poly',pts:[[x,y],...],closed}
   Guides:   {t:'gline',a,b,c}  (ax+by=c, normalized)  — construction only
   All units mm. Y up. Screen transform flips Y.
   ============================================================ */
var DOC = {stock:{w:200,h:120,origin:'corner'}, ents:[], guides:[], dims:[]};
/* ---------------- dimensions (associative annotation layer) ----------------
   A dimension stores WHICH entities it measures (by stable id), not a number, so it
   re-reads the geometry every frame and can never go stale. Editing its value drives
   the geometry through the same relApply/entApply paths the D-key uses. */
var ENT_SEQ = 1;
function entId(e){                       // lazily assign a stable, globally unique id
  if (!e) return null;
  // random prefix + counter: never collides with ids saved in an earlier session
  if (!e._id) e._id = 'e' + Math.random().toString(36).slice(2, 9) + (ENT_SEQ++).toString(36);
  return e._id;
}
function entById(id){
  for (var i = 0; i < DOC.ents.length; i++) if (DOC.ents[i]._id === id) return DOC.ents[i];
  return null;
}
/* ---------------- text ----------------
   A text entity stays editable: {t:'text', str, font, h, align, x, y, rot, fy}.
   (x,y) is the anchor on the first line's baseline; h is the CAPITAL-letter height in mm;
   fy marks a mirrored copy. Glyph outlines come from opentype.js, flattened to polylines
   and cached per entity (in a WeakMap, so caches never leak into saved files or undo). */
var FONT_CDN = 'https://cdn.jsdelivr.net/npm/@fontsource/';
var FONTS = {
  'roboto':               {name:'Roboto',              pkg:'roboto@5.3.0',              file:'roboto-latin-400-normal.woff', cat:'sans'},
  'roboto-bold':          {name:'Roboto Bold',         pkg:'roboto@5.3.0',              file:'roboto-latin-700-normal.woff', cat:'sans'},
  'montserrat':           {name:'Montserrat',          pkg:'montserrat@5.3.0',          file:'montserrat-latin-400-normal.woff', cat:'sans'},
  'montserrat-bold':      {name:'Montserrat Bold',     pkg:'montserrat@5.3.0',          file:'montserrat-latin-700-normal.woff', cat:'sans'},
  'oswald':               {name:'Oswald',              pkg:'oswald@5.3.0',              file:'oswald-latin-400-normal.woff', cat:'sans'},
  'bebas-neue':           {name:'Bebas Neue',          pkg:'bebas-neue@5.3.0',          file:'bebas-neue-latin-400-normal.woff', cat:'display'},
  'anton':                {name:'Anton',               pkg:'anton@5.3.0',               file:'anton-latin-400-normal.woff', cat:'display'},
  'archivo-black':        {name:'Archivo Black',       pkg:'archivo-black@5.3.0',       file:'archivo-black-latin-400-normal.woff', cat:'display'},
  'bungee':               {name:'Bungee',              pkg:'bungee@5.3.0',              file:'bungee-latin-400-normal.woff', cat:'display'},
  'russo-one':            {name:'Russo One',           pkg:'russo-one@5.3.0',           file:'russo-one-latin-400-normal.woff', cat:'display'},
  'racing-sans-one':      {name:'Racing Sans One',     pkg:'racing-sans-one@5.3.0',     file:'racing-sans-one-latin-400-normal.woff', cat:'display'},
  'roboto-slab':          {name:'Roboto Slab',         pkg:'roboto-slab@5.3.0',         file:'roboto-slab-latin-400-normal.woff', cat:'slab'},
  'alfa-slab-one':        {name:'Alfa Slab One',       pkg:'alfa-slab-one@5.3.0',       file:'alfa-slab-one-latin-400-normal.woff', cat:'slab'},
  'roboto-mono':          {name:'Roboto Mono',         pkg:'roboto-mono@5.3.0',         file:'roboto-mono-latin-400-normal.woff', cat:'slab'},
  'allerta-stencil':      {name:'Allerta Stencil',     pkg:'allerta-stencil@5.3.0',     file:'allerta-stencil-latin-400-normal.woff', cat:'stencil'},
  'stardos-stencil':      {name:'Stardos Stencil',     pkg:'stardos-stencil@5.3.0',     file:'stardos-stencil-latin-400-normal.woff', cat:'stencil'},
  'saira-stencil-one':    {name:'Saira Stencil One',   pkg:'saira-stencil-one@5.3.0',   file:'saira-stencil-one-latin-400-normal.woff', cat:'stencil'},
  'black-ops-one':        {name:'Black Ops One',       pkg:'black-ops-one@5.3.0',       file:'black-ops-one-latin-400-normal.woff', cat:'stencil'},
  'pacifico':             {name:'Pacifico',            pkg:'pacifico@5.3.0',            file:'pacifico-latin-400-normal.woff', cat:'script'},
  'lobster':              {name:'Lobster',             pkg:'lobster@5.3.0',             file:'lobster-latin-400-normal.woff', cat:'script'}
};
// dropdown groups, in order; stencil fonts were checked to leave no islands in letters or digits
var FONT_CATS = [['sans','Sans'],['display','Bold and display'],['slab','Slab and mono'],
                 ['stencil','Stencil (centers stay attached)'],['script','Script']];
var FONTS_CACHED_READY = false;   // true once saved custom fonts have been read back
