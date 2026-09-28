# One-off: splits 454 Control's single index.html into source files under apps/control/src, cut at
# whole-line boundaries, so that apps/control/build.mjs reassembles the original byte for byte.
# Kept in the repository as the record of how the split was made.
#
#   python3 apps/control/tools/split.py <index.html> <apps/control/src>
import os, sys

SRC_HTML, OUT = sys.argv[1], sys.argv[2]
text = open(SRC_HTML, encoding='utf-8').read()
lines = text.split('\n')                 # lines[i] is line i+1; the last element follows the final newline

def line_of(s, start=0):
    """1-based number of the first line that is exactly s (stripped), from line `start`"""
    for i in range(start, len(lines)):
        if lines[i].strip() == s: return i + 1
    raise SystemExit('split: no line "%s"' % s)

style_open = line_of('<style>'); style_close = line_of('</style>', style_open)
check_open = line_of('<script>'); check_close = line_of('</script>', check_open)
main_open = line_of('<script>', check_close); main_close = line_of('</script>', main_open)

# the main script, cut where its subject changes: (first line, file). Each runs to the next one's line.
CUTS = [
    (main_open + 1, 'parser.js'),            # G-code parser: GRBL / Carbide Motion dialect
    (1300, 'checks.js'),                     # dynamic checks: work area, stock depth, rapids
    (1344, 'viewer.js'),                     # the three.js 3D view
    (1742, 'playback.js'),                   # simulated playback and progress colouring
    (1888, 'code-panel.js'),                 # the Code tab (virtualised list)
    (1939, 'checks-panel.js'),               # the Checks tab and the summary stats
    (1967, 'job-summary.js'),                # the Toolpaths tab: per-toolpath summaries
    (2152, 'wiring.js'),                     # settings read-back, loading files, wiring the page
    (2406, 'machine-state.js'),              # the machine layer's state
    (2449, 'jogging.js'),
    (2540, 'estop.js'),
    (2562, 'probing.js'),                    # the probing engine
    (2616, 'bitsetter.js'),
    (2765, 'bitzero.js'),
    (2837, 'overrides.js'),                  # real-time overrides and Z nudge
    (2917, 'jog-panel.js'),                  # the jog panel and its keyboard, and the tool-change prompt's jog actions
    (3032, 'serial.js'),                     # the connection: send, read, handle each line
    (3251, 'status.js'),                     # status reports and the status display
    (3392, 'profile-defaults.js'),           # the machine profile's defaults
    (3409, 'quick-actions-state.js'),
    ('// Offer homing once per connection', 'dialogs.js', 'exact'),   # in-app dialogs, notes and help
    (3481, 'controller-check.js'),           # checking the controller's settings; the connect prompt
    (3544, 'theme.js'),
    ('var HOME_ASKED = false;', 'home-prompt.js', 'exact'),
    (3627, 'quick-actions.js'),
    (3787, 'profile.js'),                    # saving, loading and applying the machine profile
    (3975, 'controller-config.js'),
    (4133, 'job-streaming.js'),
    (4163, 'recovery-state.js'),             # the modal state at a line, for recovery
    (4236, 'job-builder.js'),                # what a job sends: spin-up, lifts, tool changes, the ending
    (4417, 'job-run.js'),                    # running a job: filling the buffer, holds, stopping, finishing
    (4799, 'recovery.js'),                   # starting from a line
    (4942, 'machine-tab.js'),                # wiring the Machine tab
]

# A cut taken at a function or variable moves up past the comment lines directly above it, so each
# comment stays in the same file as the code it describes. (A blank line stops it.)
def is_comment(l):
    t = l.strip()
    return t.startswith('//') or t.startswith('/*') or t.startswith('*') or \
           (l.startswith('var ') and t.endswith(';'))          # a one-line variable belongs with the code below it too
def with_comments(first):
    while first > 1 and is_comment(lines[first - 2]) and not lines[first - 1].strip().startswith(('/*', '//')):
        first -= 1
    while first > 1 and is_comment(lines[first - 2]):
        first -= 1
    return first
# A cut is a line number, or the text a line starts with; 'exact' cuts stay exactly where they are.
def line_starting(text):
    hits = [i + 1 for i, l in enumerate(lines) if l.startswith(text)]
    if len(hits) != 1: raise SystemExit('split: %d lines start with "%s"' % (len(hits), text))
    return hits[0]
CUTS = [(c if not isinstance(c, str) else line_starting(c), n, (rest[0] if rest else '')) for c, n, *rest in CUTS]
CUTS = [(c if i == 0 or exact == 'exact' else with_comments(c), n) for i, (c, n, exact) in enumerate(CUTS)]

def chunk(first, last):
    """lines first..last (1-based, inclusive), each with its newline"""
    return ''.join(l + '\n' for l in lines[first - 1:last])

os.makedirs(os.path.join(OUT, 'js'), exist_ok=True); os.makedirs(os.path.join(OUT, 'styles'), exist_ok=True)
files = {}
files['styles/control.css'] = chunk(style_open + 1, style_close - 1)
files['js/browser-check.js'] = chunk(check_open + 1, check_close - 1)
bounds = [c[0] for c in CUTS] + [main_close]
assert bounds == sorted(bounds) and len(set(bounds)) == len(bounds), 'cuts out of order'
for (first, name), nxt in zip(CUTS, bounds[1:]):
    files['js/' + name] = chunk(first, nxt - 1)

# the page itself: everything else, with an include line where each file's lines were
tpl = chunk(1, style_open) + '@@include styles/control.css\n' + chunk(style_close, check_open) + '@@include js/browser-check.js\n' + chunk(check_close, main_open)
tpl += ''.join('@@include js/%s\n' % name for _, name in CUTS)
tpl += '\n'.join(lines[main_close - 1:])                   # to the end, exactly (no newline added)
files['control.html'] = tpl

for name, body in files.items():
    open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='').write(body)
print('%d files: %s' % (len(files), ', '.join(sorted(files))))
