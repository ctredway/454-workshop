# 454 Design: source

454 Design is one page, `design.html` at the top of the repository (the CAM engine, `cam.js` and `geom.js`,
loads beside it), used as it is by the website and the desktop app. It's assembled from the files here, so
it can be worked on in pieces.

```sh
node apps/design/build.mjs            # assemble design.html from src/
node apps/design/build.mjs --check    # does design.html match src/? (GitHub checks this on every push)
```

**Edit the files in `src/`, then build.** Don't edit `design.html` itself: the check fails if it doesn't
match its sources.

`src/design.html` is the page, with an `@@include` line wherever a file's contents go. They're included
exactly as they are, in the order listed, and everything shares one scope, as before the split. Design's
version is in `src/js/version.js`.

## The files, in the order they're included

| File | Lines | What's in it |
| --- | ---: | --- |
| `styles/design.css` | 419 | all of Design’s styles |
| `js/cam-loader.js` | 12 | loads the CAM engine (geom.js, cam.js) unless ?cam=off turned it off |
| `js/version.js` | 2 | Design’s version |
| `js/model.js` | 55 | the drawing’s model: entity ids |
| `js/fonts.js` | 73 | fonts: loading, the font library, your own fonts |
| `js/text.js` | 205 | text: glyph outlines, placing, the Text panel, converting to curves |
| `js/text-curve.js` | 161 | text on a curve: laying the letters along it, and its settings in the Text panel |
| `js/dimensions.js` | 209 | dimensions: which edges they measure, their values and labels, editing them |
| `js/view.js` | 34 | screen and drawing coordinates, the material and the job origin |
| `js/snapping.js` | 129 | snapping: shapes’ points, guides, angles (45° and 90°), the grid |
| `js/picking.js` | 77 | what’s under the pointer: edges and shapes |
| `js/undo.js` | 45 | undo and redo |
| `js/typed-input.js` | 82 | typed coordinates (x,y, @dx,dy, length<angle) and each tool’s prompt |
| `js/tool-manager.js` | 286 | the tool manager: hover feedback, selection handles, transforms, switching tools |
| `js/tool-click.js` | 284 | what each tool does with a click |
| `js/tool-typing.js` | 300 | what each tool does with a typed value |
| `js/shapes.js` | 149 | the Ellipse, Polygon and Star tools: the shapes, clicks, typed sizes and the preview |
| `js/selbox.js` | 110 | the Selection box: exact position, size and rotation of what's selected |
| `js/prompt.js` | 42 | the floating input box and the hints |
| `js/vcarve-read.js` | 203 | reading VCarve’s file format (OLE), its vectors and toolpaths |
| `js/toolpaths.js` | 41 | toolpaths: the list and its shared helpers |
| `js/vector-check.js` | 269 | checking the drawing: open shapes, doubles, crossings, shapes nothing cuts |
| `js/toolpath-generate.js` | 189 | a toolpath’s moves, from its shapes: pockets, drilling, tabs |
| `js/toolpath-editor.js` | 540 | the toolpath editor |
| `js/toolpath-order.js` | 55 | toolpath order, deleting, tool numbers |
| `js/gcode-export.js` | 89 | Save G-code: the job’s G-code, after its checks |
| `js/dxf-export.js` | 99 | Export DXF |
| `js/svg-export.js` | 88 | Export SVG |
| `js/machine-area.js` | 96 | the machine’s cutting area |
| `js/layers.js` | 140 | layers and the Layers tab |
| `js/image-trace.js` | 287 | tracing an image into outlines |
| `js/vcarve-toolpaths.js` | 224 | turning VCarve’s toolpaths into editable 454 toolpaths |
| `js/job-sheet.js` | 180 | the job sheet |
| `js/context-menu.js` | 24 | the right-click menu |
| `js/toolpath-cards.js` | 174 | the Toolpaths panel’s cards |
| `js/preview-in-control.js` | 41 | Preview in 454 Control: handing the job to Control |
| `js/wood-preview.js` | 168 | Preview in wood: the cut worked out from the moves and each bit's shape, shaded |
| `js/wood-3d.js` | 175 | Preview in wood in 3D: the block from the simulation, and turning, moving and zooming it |
| `js/sheets.js` | 55 | sheets (multi-sheet VCarve projects) |
| `js/toolpath-panel.js` | 116 | the Toolpaths panel |
| `js/tool-library.js` | 187 | the tool library: reading VCarve’s, storage, lookups |
| `js/tool-library-dialog.js` | 374 | the Tool library dialog, and editing the library |
| `js/theme.js` | 49 | theme and accent colour, shared with 454 Control |
| `js/dialogs.js` | 21 | in-app dialogs |
| `js/tool-details.js` | 103 | the Tool details panel |
| `js/crv-import.js` | 146 | importing VCarve projects, and their sheets |
| `js/dxf-import.js` | 290 | reading DXF files |
| `js/svg-import.js` | 225 | reading SVG files |
| `js/vector-import.js` | 86 | adding a DXF or SVG to the drawing, or replacing it |
| `js/messages.js` | 81 | messages and the recent-messages panel |
| `js/persist-units.js` | 81 | saving the drawing in the browser, units, restoring |
| `js/unsaved.js` | 243 | unsaved changes: Save, Save as, Open, New, asking before closing, Recover last drawing |
| `js/clipboard.js` | 150 | copy, cut, paste and duplicate, with the dimensions on the copied shapes |
| `js/shortcuts.js` | 27 | keyboard shortcuts: Ctrl+S, O, N, A, D and F1 |
| `js/draw.js` | 614 | drawing the canvas |
| `js/offset-mirror-panels.js` | 140 | the Offset and Mirror panels |
| `js/edit-previews.js` | 75 | trim and extend previews |
| `js/geometry.js` | 146 | arcs, primitives and intersections |
| `js/trim-extend.js` | 234 | trim and extend |
| `js/fillet-paths.js` | 175 | fillets on outlines |
| `js/nesting.js` | 332 | nesting |
| `js/measuring.js` | 163 | measuring, dogbones and corners |
| `js/fillets.js` | 243 | fillets, and removing them |
| `js/transforms.js` | 198 | bounds, rotating, mirroring, scaling |
| `js/alignment.js` | 112 | aligning and distributing |
| `js/offset.js` | 75 | offsetting outlines |
| `js/join-explode.js` | 284 | join and explode |
| `js/booleans.js` | 463 | Weld, Subtract and Intersect: closed shapes combined exactly, arcs kept as arcs |
| `js/readout.js` | 134 | shapes’ sizes and the readout |
| `js/relations.js` | 108 | distances between shapes |
| `js/dimension-apply.js` | 108 | applying a dimension: moving, or stretching a held shape |
| `js/move.js` | 126 | moving shapes |
| `js/ui-settings.js` | 50 | Design’s own settings |
| `js/tool-panel.js` | 92 | the tool groups on the left, and fitting the view |
| `js/panel-wiring.js` | 163 | wiring the panels |
| `js/wiring.js` | 885 | wiring the page, and starting |

## How the split was made, and what's next

The split was mechanical: `tools/split.py` cut the single file at whole lines, named by what each cut is at
(a function, a banner, a heading) rather than by line number, so that the build reassembled the original
**byte for byte** (checked: 678,709 bytes, identical SHA-256). Nothing about how Design behaves changed;
`design.html` differs from before the split only by the note at its top.

A byte-identical split can't move anything, so a few things sit where the original file had them, for the
next stage:

- `theme.js` starts with three comments written together in the original: the Tool details heading (its
  code is `tool-details.js`), the dialogs note (`dialogs.js`), then the theme's own.
- `model.js` ends with `FONTS_CACHED_READY`, which belongs with `fonts.js`.
- `dimensions.js` ends with the canvas variables (`cv`, `ctx`), which belong with `view.js` or `draw.js`.

## Tests

```sh
node --test 'apps/design/test/*.test.mjs'     # GitHub runs these on every push
```

`test/harness.mjs` loads Design's **real source files**, in the page's order, into Node, with Design's own
markup as the page (linkedom supplies the DOM and the SVG parser), so tests exercise exactly the code Design
runs, without rewriting it into modules first. Values Design makes come from its own context, with its own
`Array` and `Object`, so tests compare plain copies of them.

**File formats** (`test/formats.test.mjs`): reading DXF (lines, circles, arcs, polyline bulges, blocks placed
scaled and rotated, splines, ellipses, layers that are off or locked, units, what isn't imported), writing
DXF and reading it back, reading SVG (units, the Y flip, arcs, Bézier accuracy, transforms, Inkscape layers,
hidden and unsupported elements), Design's own SVG coming back exactly, and adding a file to a drawing
(layers joining by name, placement, nothing already there changing). Each was checked by breaking the code
it covers and watching a test fail.

**Next:** toolpath generation (with the CAM engine loaded too), nesting, and the geometry operations.
