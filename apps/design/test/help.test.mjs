// Help inside the app (apps/shared/help.js, shared with 454 Control): a window that shows the docs' own pages with
// a search box and a list of pages. Its search and its list are tested here on Design's real sources, with a small
// made-up set of guides; and the docs' side of it (docs-site/scripts/help-index.mjs), which turns the built pages
// into the sections it searches and checks the apps only point at places that exist.
//   node --test 'apps/design/test/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadDesign } from './harness.mjs';
import { sections, words, targets, missing } from '../../../docs-site/scripts/help-index.mjs';

const D = loadDesign({ cam: true });
D.run = (code) => vm.runInContext(code, D);
const el = (id) => D.document.getElementById(id);
const plain = (v) => JSON.parse(JSON.stringify(v));
const later = (ms = 20) => new Promise((r) => setTimeout(r, ms));
// A key press, as the help's own listener gets it. (It listens at the window, on the way down, so that it hears a
// key before the app does and can keep it; the tests' page has no window to listen at, so it's handed the key.)
const key = (k, target) => {
  const e = { key: k, target: target || D.document.body, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  D.helpKey(e);
  return e;
};

const GUIDES = [
  { page: 'index.html', pageTitle: 'Overview', id: '', title: 'Overview', level: 1, text: 'Free CNC software for GRBL routers.' },
  { page: 'cam-reference.html', pageTitle: 'CAM reference', id: '', title: 'CAM reference', level: 1, text: 'Every toolpath type and setting.' },
  { page: 'cam-reference.html', pageTitle: 'CAM reference', id: 'pocket', title: 'Pocket', level: 2, text: 'Clears the area inside a shape. Stepover sets how far apart the passes are.' },
  { page: 'cam-reference.html', pageTitle: 'CAM reference', id: 'tabs', title: 'Tabs', level: 3, text: 'Tick Add tabs, then click the outline to add a tab. Tabs hold the part.' },
  { page: 'cam-reference.html', pageTitle: 'CAM reference', id: 'profile', title: 'Profile', level: 2, text: 'Cuts along an outline. A profile can have tabs and a lead in.' },
  { page: 'control-reference.html', pageTitle: 'Control reference', id: '', title: 'Control reference', level: 1, text: 'The whole screen of 454 Control.' },
  { page: 'control-reference.html', pageTitle: 'Control reference', id: 'the-machine-tab', title: 'The Machine tab', level: 2, text: 'Connect, home, jog and probe. The tab Control opens on.' },
  { page: 'control-reference.html', pageTitle: 'Control reference', id: 'probing', title: 'Probing with the BitZero', level: 2, text: 'Put the plate on the material and probe to set Z zero.' },
];
const found = (q, own) => plain(D.helpSearch(GUIDES, q, own).map((h) => h.s.page.replace('.html', '') + (h.s.id ? '#' + h.s.id : '')));
// a stand-in for fetching the guides' index
function guides(ok = true) {
  D.fetch = () => Promise.resolve(ok ? { ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(GUIDES))) } : { ok: false });
  D.run('HELP.index = null; HELP.loading = null; HELP.failed = false; if (helpIsOpen()) helpClose(); 1');
}
const nav = () => [...el('helpNav').querySelectorAll('button')].map((b) => b.className.replace(' on', '*') + ' ' + b.firstChild.textContent);

// ---- searching ----
test('a word in a heading comes before the same word in the text', () => {
  assert.deepEqual(found('tabs'), ['cam-reference#tabs', 'control-reference#the-machine-tab', 'cam-reference#profile']);
});
test('the app’s own guides come first: in Design, “tabs” are the ones that hold a part', () => {
  assert.equal(found('tabs', /^cam-/)[0], 'cam-reference#tabs');
  assert.equal(found('tabs')[0], 'cam-reference#tabs', 'a heading that is exactly the word wins anyway');
  assert.equal(found('tab', /^control-/)[0], 'cam-reference#tabs', 'even from the other app');
  // "outline" is only in the text of two of Design's sections and one of Control's
  const G2 = GUIDES.concat([{ page: 'control-reference.html', pageTitle: 'Control reference', id: 'preview', title: 'The preview', level: 2, text: 'The outline of the job is drawn.' }]);
  const order = (own) => plain(D.helpSearch(G2, 'outline', own).map((h) => h.s.id));
  assert.deepEqual(order(/^cam-/), ['tabs', 'profile', 'preview']);
  assert.deepEqual(order(/^control-/), ['preview', 'tabs', 'profile']);
});
test('every word asked for must be there', () => {
  assert.deepEqual(found('profile tabs'), ['cam-reference#profile']);
  assert.deepEqual(found('pocket tabs'), []);
  assert.deepEqual(found('zzz'), []);
  assert.deepEqual(found(''), []);
  assert.deepEqual(found('   '), []);
});
test('“probing” finds “probe”, and capitals don’t matter', () => {
  assert.deepEqual(found('PROBE'), ['control-reference#probing', 'control-reference#the-machine-tab']);
  assert.deepEqual(found('probing'), found('probe'));
  assert.deepEqual(plain(D.helpTerms('Tabs, Probing & pockets')), ['tab', 'prob', 'pocket']);
  assert.deepEqual(plain(D.helpTerms('is as $30')), ['is', 'as', '$30'], 'short words and settings like $30 stay whole');
});
test('a page’s name counts: “control” finds its sections', () => {
  assert.ok(found('control').every((p) => p.startsWith('control-reference')));
  assert.equal(found('control').length, 3);
  assert.equal(found('control')[0], 'control-reference', 'the top of the page first');
});
test('the few words shown under a result are from round the word found', () => {
  const long = { page: 'a.html', pageTitle: 'A', id: 'x', title: 'X', level: 2, text: 'start '.repeat(40) + 'the stepover is here ' + 'end '.repeat(60) };
  const hit = D.helpSearch([long], 'stepover')[0], snip = D.helpSnippet(hit);
  assert.match(snip, /^…/); assert.match(snip, /…$/);
  assert.ok(snip.includes('the stepover is here'));
  assert.ok(snip.length < 170);
  assert.equal(D.helpSnippet(D.helpSearch(GUIDES, 'pocket')[0]), GUIDES[2].text, 'a short section is shown whole');
});

// ---- the window ----
test('F1 opens the help at the guide for what’s on screen, with the search box ready', async () => {
  guides();
  D.run('DOC.toolpaths = []; if (CUT) cutClose(); 1');
  assert.equal(D.helpIsOpen(), false);
  const e = key('F1');
  assert.equal(e.prevented, true, 'the browser’s own F1 doesn’t happen');
  assert.equal(D.helpIsOpen(), true);
  await later();
  assert.equal(el('helpFrame').getAttribute('src'), 'docs/design-quickstart.html');
  assert.equal(el('helpFull').getAttribute('href'), 'docs/design-quickstart.html');
  assert.equal(el('helpQ').value, '');
  key('Escape');
  assert.equal(D.helpIsOpen(), false);
});
test('the ? button in the header opens it too', async () => {
  guides();
  el('helpBtn').click();
  assert.equal(D.helpIsOpen(), true);
  D.helpClose();
});
test('where it opens: the toolpath editor’s kind of cut, an open window, or the quick start', () => {
  D.run(`DOC.toolpaths = []; DOC.ents = [{t: 'rect', x: 0, y: 0, w: 10, h: 10}]; SEL = [0]; 1`);
  assert.equal(D.designHelpWhere(), 'design-quickstart.html');
  D.cutOpen(null);
  assert.equal(D.designHelpWhere(), 'cam-reference.html#profile');
  for (const [side, where] of Object.entries(plain(D.HELP_FOR_CUT))) { D.CUT.side = side; assert.equal(D.designHelpWhere(), where, side); }
  assert.deepEqual(Object.keys(plain(D.HELP_FOR_CUT)).sort(), [...el('cutType').options].map((o) => o.value).sort(), 'every kind of cut has its place');
  el('jobModal').hidden = false;
  assert.equal(D.designHelpWhere(), 'design-workspace.html#job-setup', 'a window on top comes first');
  el('jobModal').hidden = true;
  D.cutClose();
  for (const [id] of plain(D.HELP_FOR_WINDOW)) assert.ok(el(id), id + ' is a window in Design');
});
test('the list shows the pages, and the sections of the one being read', async () => {
  guides();
  D.helpOpen('cam-reference.html#pocket');
  await later();
  assert.deepEqual(nav(), ['helpPg Overview', 'helpPg* CAM reference', 'helpSec* Pocket', 'helpSec Profile', 'helpPg Control reference']);
  assert.equal(el('helpFrame').getAttribute('src'), 'docs/cam-reference.html#pocket');
  el('helpNav').querySelectorAll('button')[4].click();    // another page
  assert.equal(el('helpFrame').getAttribute('src'), 'docs/control-reference.html');
  assert.deepEqual(nav(), ['helpPg Overview', 'helpPg CAM reference', 'helpPg* Control reference', 'helpSec The Machine tab', 'helpSec Probing with the BitZero']);
  D.helpClose();
});
test('typing searches; a result opens its section; Enter opens the first', async () => {
  guides();
  D.helpOpen('index.html');
  await later();
  el('helpQ').value = 'tabs'; el('helpQ').dispatchEvent(new D.Event('input', { bubbles: true }));
  assert.equal(el('helpNav').querySelector('.helpMsg').textContent, '3 places in the guides');
  assert.deepEqual(nav(), ['helpHit Tabs', 'helpHit The Machine tab', 'helpHit Profile'], 'headings with the word, then text with it');
  const hit = el('helpNav').querySelector('.helpHit');
  assert.equal(hit.querySelector('.helpIn').textContent, 'CAM reference');
  assert.match(hit.querySelector('.helpSnip').textContent, /Tick Add tabs/);
  key('Enter', el('helpQ'));
  assert.equal(el('helpFrame').getAttribute('src'), 'docs/cam-reference.html#tabs');
  assert.equal(nav()[0], 'helpHit* Tabs', 'and it’s marked as the one being read');
  el('helpNav').querySelectorAll('.helpHit')[1].click();
  assert.equal(el('helpFrame').getAttribute('src'), 'docs/control-reference.html#the-machine-tab');
  el('helpQ').value = 'zzz'; el('helpQ').dispatchEvent(new D.Event('input', { bubbles: true }));
  assert.match(el('helpNav').querySelector('.helpMsg').textContent, /^Nothing in the guides has “zzz”/);
  assert.equal(el('helpNav').querySelectorAll('.helpPg').length, 3, 'with the pages to pick from instead');
  D.helpClose();
  D.helpOpen('index.html');
  assert.equal(el('helpQ').value, '', 'opened again, the search box is empty');
  assert.equal(el('helpNav').querySelector('.helpMsg'), null, 'and the pages are listed, not the last search');
  D.helpClose();
});
test('while help is open the app’s shortcuts don’t hear the keys; with it closed they do', async () => {
  guides();
  assert.equal(key('Delete').stopped, false, 'closed: a key goes on to the app');
  D.helpOpen('index.html');
  assert.equal(key('Delete').stopped, true, 'open: it’s kept from the app');
  const typed = key('a', el('helpQ'));
  assert.deepEqual([typed.stopped, typed.prevented], [true, false], 'a letter typed in the search box is kept from the app, and still typed');
  const again = key('F1');
  assert.deepEqual([again.stopped, again.prevented, D.helpIsOpen()], [true, true, true], 'F1 again leaves it open');
  const esc = key('Escape');
  assert.deepEqual([esc.stopped, D.helpIsOpen()], [true, false], 'Escape closes it, and the app doesn’t hear that Escape');
  assert.equal(key('Delete').stopped, false, 'closed again: keys go to the app');
  // it listens at the window on the way down, and only for presses: a key let go is always heard by the app,
  // which in 454 Control is what stops a jog
  const code = fs.readFileSync(new URL('../../shared/help.js', import.meta.url), 'utf8');
  assert.ok(code.includes("window.addEventListener('keydown', helpKey, true);"));
  assert.equal(code.split('addEventListener(\'key').length - 1, 1, 'its only key listener');
});
test('a copy with no guides beside it says so and offers the website’s', async () => {
  guides(false);
  D.helpOpen('cam-reference.html#pocket');
  await later();
  assert.equal(D.HELP.failed, true);
  assert.equal(el('helpNone').hidden, false);
  assert.equal(el('helpFrame').hidden, true);
  assert.match(el('helpNone').textContent, /The guides aren’t beside this copy of the app/);
  assert.equal(el('helpNone').querySelector('a').getAttribute('href'), 'https://454workshop.com/docs/');
  assert.equal(el('helpFull').getAttribute('href'), 'https://454workshop.com/docs/');
  D.helpClose();
  D.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(GUIDES))) });
  D.helpOpen('index.html');                                // and when they're there the next time, it works
  await later();
  assert.equal(D.HELP.failed, false);
  assert.equal(el('helpFrame').hidden, false);
  D.helpClose();
});
test('the guides are looked for where the Docs link points (the website’s build moves it)', () => {
  assert.equal(D.helpBase(), 'docs/');
  const a = el('openDocs'), was = a.getAttribute('href');
  a.setAttribute('href', '../docs/index.html');
  assert.equal(D.helpBase(), '../docs/');
  a.setAttribute('href', was);
});

// ---- the docs' side ----
const PAGE = `<html><body><nav><h2 id="menu">Menu</h2></nav><main>
<div><h1 id="_top">CAM <em>reference</em></h1></div><p>Every toolpath &amp; setting.</p>
<div class="sl-heading-wrapper level-h2"><h2 id="pocket">Pocket</h2><a class="sl-anchor-link" href="#pocket"><span class="sr-only">Section titled “Pocket”</span></a></div>
<p>Clears the area.</p><img src="x.png" alt="A picture of a pocket"><style>.x{color:red}</style><script>var hidden = 1;</script>
<h3 id="islands">Islands</h3><p>Left standing&nbsp;&mdash; it&#39;s &#x2713;.</p>
<h2>No address</h2><p>Still part of Islands.</p>
</main><footer><h2 id="foot">Footer</h2></footer></body></html>`;
test('a built page becomes its sections: the top, then each heading with an address', () => {
  assert.deepEqual(sections(PAGE, 'cam-reference.html'), [
    { page: 'cam-reference.html', pageTitle: 'CAM reference', id: '', title: 'CAM reference', level: 1, text: 'Every toolpath & setting.' },
    { page: 'cam-reference.html', pageTitle: 'CAM reference', id: 'pocket', title: 'Pocket', level: 2, text: 'Clears the area.' },
    { page: 'cam-reference.html', pageTitle: 'CAM reference', id: 'islands', title: 'Islands', level: 3, text: 'Left standing — it\'s ✓. No address Still part of Islands.' },
  ]);
  assert.deepEqual(sections('<html><body>no main here</body></html>', 'x.html'), []);
  assert.equal(words('<p>a <b>b</b>\n  c</p>'), 'a b c');
});
test('the places the apps open their help at are read from their files, and a missing one is found', () => {
  const src = `var A = {x: 'cam-reference.html#pocket', y: 'cam-reference.html#gone'}; return 'index.html'; var no = 'design.html is a page';`;
  assert.deepEqual(targets(src), [{ page: 'cam-reference.html', id: 'pocket' }, { page: 'cam-reference.html', id: 'gone' }, { page: 'index.html', id: '' }]);
  assert.deepEqual(missing(GUIDES, targets(src)), [{ page: 'cam-reference.html', id: 'gone' }]);
  assert.deepEqual(missing(GUIDES, [{ page: 'nowhere.html', id: '' }]), [{ page: 'nowhere.html', id: '' }]);
});
test('every place Design and Control open their help at is one the docs’ build will check', () => {
  for (const app of ['design', 'control']) {
    const list = targets(fs.readFileSync(new URL('../../' + app + '/src/js/help-where.js', import.meta.url), 'utf8'));
    assert.ok(list.length >= 6, app + ' names its places in a form the check reads: ' + list.length);
    assert.ok(list.every((t) => /^[a-z-]+\.html$/.test(t.page)));
  }
  const dist = new URL('../../../docs-site/dist/help-index.json', import.meta.url);
  if (!fs.existsSync(dist)) return;                        // the docs aren't built here: their own build checks it
  const index = JSON.parse(fs.readFileSync(dist, 'utf8'));
  for (const app of ['design', 'control'])
    assert.deepEqual(missing(index, targets(fs.readFileSync(new URL('../../' + app + '/src/js/help-where.js', import.meta.url), 'utf8'))), [], app);
});
