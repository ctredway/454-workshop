# One-off: splits 454 Design's single design.html into source files under apps/design/src, cut at whole
# lines, so that apps/design/build.mjs reassembles the original byte for byte. Kept in the repository as the
# record of how the split was made.
#
#   python3 apps/design/tools/split.py <design.html> <apps/design/src>
#
# Each cut is named by what it cuts at, not a line number: ('fn', name) a top-level function, ('banner',
# title) a /* ==== */ banner by its title, ('text', start) a line starting with that text. Every marker must
# be found exactly once. A cut moves up past the comments (and one-line vars) directly above it, so each
# comment stays with its code.
import os, sys

SRC_HTML, OUT = sys.argv[1], sys.argv[2]
text = open(SRC_HTML, encoding='utf-8').read()
lines = text.split('\n')

def only(hits, what):
    if len(hits) != 1: raise SystemExit('split: %d matches for %s' % (len(hits), what))
    return hits[0]
def line_is(s, start=0):
    return only([i + 1 for i in range(start, len(lines)) if lines[i].strip() == s][:1], '"%s"' % s)

style_open = line_is('<style>'); style_close = line_is('</style>', style_open)
# the scripts: the CAM loader, then the main script
script_opens = [i + 1 for i, l in enumerate(lines) if l.strip() == '<script>']
loader_open, main_open = script_opens[0], script_opens[1]
loader_close = line_is('</script>', loader_open); main_close = line_is('</script>', main_open)

CUTS = [
    ('start', 'version.js'),                                      # 'use strict' and the version
    (('banner', '454 Design \u2014 geometry model'), 'model.js'),  # entity ids
    (('fn', 'fontObj'), 'fonts.js'),
    (('fn', 'capHeightUnits'), 'text.js'),                        # text geometry, the Text panel, text to curves
    (('fn', 'dimsArr'), 'dimensions.js'),                         # dimensions: which edges, values, labels, editing
    (('fn', 's2w'), 'view.js'),                                   # screen and world, the job origin
    (('fn', 'snapPoints'), 'snapping.js'),                        # snap points, guides, angle snap
    (('fn', 'entityEdges'), 'picking.js'),                        # what's under the pointer
    (('fn', 'tpLean'), 'undo.js'),                                # snapshots, undo and redo
    (('fn', 'parseNumericPoint'), 'typed-input.js'),              # typed coordinates and prompts
    (('banner', 'TOOL MANAGER  (state machine)'), 'tool-manager.js'),   # hover feedback, handles, tool state
    (('fn', 'toolClick'), 'tool-click.js'),                       # what each tool does with a click
    (('fn', 'toolCommitText'), 'tool-typing.js'),                 # what each tool does with typed values
    (('fn', 'floatAtWorld'), 'prompt.js'),                        # the floating input and hints
    (('fn', 'oleParse'), 'vcarve-read.js'),                       # reading VCarve's file format
    (('banner', 'TOOLPATHS (CAM)'), 'toolpaths.js'),
    (('banner', 'VECTOR CHECKING'), 'vector-check.js'),           # open shapes, doubles, crossings; Check
    (('fn', 'tpPocketGroups'), 'toolpath-generate.js'),           # a toolpath's moves, from its shapes
    (('text', '// ---- the editor ----'), 'toolpath-editor.js'),  # the toolpath editor
    (('fn', 'tpMoveTo'), 'toolpath-order.js'),                    # order, deleting, tool numbers
    (('fn', 'tpExport'), 'gcode-export.js'),                      # Save G-code
    (('banner', 'DXF EXPORT'), 'dxf-export.js'),
    (('banner', 'SVG EXPORT'), 'svg-export.js'),
    (('banner', 'MACHINE AREA'), 'machine-area.js'),
    (('banner', 'LAYERS'), 'layers.js'),
    (('banner', 'IMAGE TRACE'), 'image-trace.js'),
    (('banner', 'VCARVE TOOLPATHS -> EDITABLE 454 TOOLPATHS'), 'vcarve-toolpaths.js'),
    (('text', '// ---- the job sheet:'), 'job-sheet.js'),
    (('text', '// ---- a small right-click menu:'), 'context-menu.js'),
    (('fn', 'tpRows'), 'toolpath-cards.js'),                      # the Toolpaths panel's cards
    (('text', '// ---- Preview in 454 Control ----'), 'preview-in-control.js'),
    (('text', '// ---- sheets ----'), 'sheets.js'),
    (('fn', 'renderToolpathPanel'), 'toolpath-panel.js'),
    (('banner', 'TOOL LIBRARY'), 'tool-library.js'),              # the library: reading VCarve's, storage, lookups
    (('text', '// ---- the Tool library dialog ----'), 'tool-library-dialog.js'),
    (('fn', 'canvasPal'), 'theme.js'),
    (('fn', 'uiDialog'), 'dialogs.js'),
    (('fn', 'openToolDetails'), 'tool-details.js'),
    (('fn', 'crvAscii'), 'crv-import.js'),                        # VCarve projects
    (('fn', 'dxfParsePairs'), 'dxf-import.js'),
    (('text', '// ---- SVG import ----'), 'svg-import.js'),
    (('text', '// ---- adding a DXF or SVG to the drawing ----'), 'vector-import.js'),
    (('fn', 'toast'), 'messages.js'),                             # messages and the message panel
    (('fn', 'persist'), 'persist-units.js'),                      # saving the drawing, units, restoring
    (('fn', 'draw'), 'draw.js'),                                  # drawing the canvas
    (('fn', 'offOpen'), 'offset-mirror-panels.js'),               # the Offset and Mirror panels
    (('fn', 'dryEdit'), 'edit-previews.js'),                      # trim and extend previews
    (('fn', 'arcFrom3'), 'geometry.js'),                          # arcs, primitives, intersections
    (('fn', 'doTrim'), 'trim-extend.js'),
    (('fn', 'polyToPath'), 'fillet-paths.js'),                    # fillets on outlines
    (('text', '// ---- nesting ----'), 'nesting.js'),
    (('text', '// ---- measuring ----'), 'measuring.js'),         # measuring, dogbones, corners
    (('text', '// ---- removing a fillet ----'), 'fillets.js'),
    (('fn', 'entBBox'), 'transforms.js'),                         # bounds, rotate, mirror, scale
    (('text', '// ---- alignment (matches VCarve) ----'), 'alignment.js'),
    (('fn', 'signedArea'), 'offset.js'),
    (('text', '// ---- join:'), 'join-explode.js'),
    (('fn', 'tessPath'), 'readout.js'),                           # sizes and the readout
    (('fn', 'repPoint'), 'relations.js'),                         # distances between shapes
    (('text', '// ---- dimensions that hold a shape ----'), 'dimension-apply.js'),
    (('fn', 'moveEntity'), 'move.js'),
    (('fn', 'uiCfgLoad'), 'ui-settings.js'),
    (('fn', 'buildToolPanel'), 'tool-panel.js'),
    (('fn', 'wirePanel'), 'panel-wiring.js'),
    (('fn', 'wire'), 'wiring.js'),                                # wiring the page, and starting
]

def locate(spec):
    kind, v = spec
    if kind == 'fn':
        return only([i + 1 for i in range(main_open, main_close) if lines[i].startswith('function ' + v + '(') or lines[i].startswith('async function ' + v + '(')], 'function ' + v)
    if kind == 'text':
        return only([i + 1 for i in range(main_open, main_close) if lines[i].startswith(v)], '"%s"' % v)
    if kind == 'banner':                                          # the /* ==== line above the title
        t = only([i + 1 for i in range(main_open, main_close) if lines[i].strip() == v], 'banner ' + v)
        return t - 1
    raise SystemExit('split: unknown cut ' + repr(spec))

def is_comment(l):
    t = l.strip()
    return t.startswith('//') or t.startswith('/*') or t.startswith('*') or (l.startswith('var ') and t.endswith(';'))
def with_comments(first):
    while first > main_open + 1:
        above = lines[first - 2]
        if above.rstrip().endswith('*/') and not above.lstrip().startswith('/*'):
            # the end of a block comment whose middle lines are plain text: go up to where it starts
            k = first - 2
            while k > main_open and '/*' not in lines[k]: k -= 1
            first = k + 1
        elif is_comment(above): first -= 1
        else: break
    return first

cuts = []
for spec, name in CUTS:
    if spec == 'start': cuts.append((main_open + 1, name)); continue
    at = locate(spec)
    cuts.append((at if spec[0] == 'banner' else with_comments(at), name))
bounds = [c for c, _ in cuts] + [main_close]
assert bounds == sorted(bounds) and len(set(bounds)) == len(bounds), 'cuts out of order: ' + repr([(c, n) for c, n in cuts])

def chunk(first, last):
    return ''.join(l + '\n' for l in lines[first - 1:last])

os.makedirs(os.path.join(OUT, 'js'), exist_ok=True); os.makedirs(os.path.join(OUT, 'styles'), exist_ok=True)
files = {'styles/design.css': chunk(style_open + 1, style_close - 1),
         'js/cam-loader.js': chunk(loader_open + 1, loader_close - 1)}
for (first, name), nxt in zip(cuts, bounds[1:]):
    files['js/' + name] = chunk(first, nxt - 1)
tpl = chunk(1, style_open) + '@@include styles/design.css\n' + chunk(style_close, loader_open) + '@@include js/cam-loader.js\n' + chunk(loader_close, main_open)
tpl += ''.join('@@include js/%s\n' % name for _, name in cuts)
tpl += '\n'.join(lines[main_close - 1:])
files['design.html'] = tpl
for name, body in files.items():
    open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='').write(body)
print('%d files' % len(files))
