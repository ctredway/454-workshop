# One-off: converts the hand-written HTML docs (docs/*.html) into Starlight pages
# (docs-site/src/content/docs/*.mdx), keeping every word. Kept in the repo as a record of how the
# pages moved across; the MDX files are the source from now on.
#
#   python3 scripts/html2mdx.py ../docs src/content/docs
import re, sys, os, html
from bs4 import BeautifulSoup, NavigableString, Tag

SRC, OUT = sys.argv[1], sys.argv[2]

def slug(text):
    # github-slugger, as Starlight uses for heading anchors
    t = text.strip().lower()
    t = re.sub(r"[^\w\- ]", "", t, flags=re.UNICODE)
    return t.replace(" ", "-")

def esc(t):
    # MDX treats < > { } as syntax in text
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace("{", "&#123;").replace("}", "&#125;"))

APP_LINKS = {"../index.html": "/control/", "../design.html": "/design/"}

class Page:
    def __init__(self, anchors):
        self.anchors = anchors          # old id -> new slug, for this page
        self.uses = set()               # components to import

    def href(self, h):
        if h in APP_LINKS: return APP_LINKS[h]
        if h.startswith("#"): return "#" + self.anchors.get(h[1:], h[1:])
        m = re.match(r"([a-z-]+\.html)#(.+)$", h)
        if m: return h                  # links into other pages keep their anchor (fixed up after)
        return h

    def inline(self, node):
        out = []
        for c in node.children:
            if isinstance(c, NavigableString):
                out.append(esc(re.sub(r"\s+", " ", str(c))))
                continue
            if not isinstance(c, Tag): continue
            if c.name in ("b", "strong"): out.append("**" + self.inline(c).strip() + "**")
            elif c.name in ("i", "em"): out.append("*" + self.inline(c).strip() + "*")
            elif c.name == "code": out.append("`" + c.get_text() + "`")
            elif c.name == "kbd": out.append("<kbd>" + esc(c.get_text()) + "</kbd>")
            elif c.name == "br": out.append("<br />")
            elif c.name == "span" and "sr" in (c.get("class") or []): continue
            elif c.name == "a":
                h = self.href(c.get("href", ""))
                text = self.inline(c).strip()
                if c.get("target") == "_blank":
                    out.append('<a href="%s" target="_blank" rel="noopener">%s<span class="sr-only"> (opens in a new tab)</span></a>' % (h, text))
                else:
                    out.append("[%s](%s)" % (text, h))
            else: out.append(self.inline(c))
        return "".join(out)

    def block(self, node, depth=0):
        out = []
        for c in node.children:
            if isinstance(c, NavigableString):
                t = str(c).strip()
                if t: out.append(esc(re.sub(r"\s+", " ", t)))
                continue
            if not isinstance(c, Tag): continue
            cls = c.get("class") or []
            if c.name == "h2": out.append("## " + c.get_text().strip())
            elif c.name == "h3":
                keys = [k.get_text() for k in c.find_all("kbd")]   # a tool's shortcut: its own line, not part of the heading
                for k in c.find_all("kbd"): k.decompose()
                out.append("### " + c.get_text().strip())
                if keys: out.append("Shortcut: " + " ".join("<kbd>%s</kbd>" % esc(k) for k in keys))
            elif c.name == "p" and "note" in cls:
                out.append(":::tip\n" + self.inline(c).strip() + "\n:::")
            elif c.name == "p": out.append(self.inline(c).strip())
            elif c.name in ("ul", "ol"):
                lines = []
                for i, li in enumerate(c.find_all("li", recursive=False), 1):
                    mark = ("%d. " % i) if c.name == "ol" else "- "
                    lines.append(self.li(li, mark))
                lst = "\n".join(lines)
                if c.name == "ol" and "steps" in cls:
                    self.uses.add("Steps")
                    out.append("<Steps>\n\n" + lst + "\n\n</Steps>")
                else: out.append(lst)
            elif c.name == "table":
                rows = c.find_all("tr")
                cells = [[self.inline(td).strip().replace("|", "\\|") for td in r.find_all(["th", "td"])] for r in rows]
                md = ["| " + " | ".join(cells[0]) + " |", "| " + " | ".join("---" for _ in cells[0]) + " |"]
                md += ["| " + " | ".join(r) + " |" for r in cells[1:]]
                out.append("\n".join(md))
            elif c.name == "div" and "warn" in cls:
                out.append(":::caution\n" + self.inline(c).strip() + "\n:::")
            elif c.name == "div" and "cm" in cls:
                self.uses.add("Compare")
                b = c.find("b"); title = b.get_text().strip() if b else ""
                if b: b.extract()
                kind = "same" if "same" in cls else "diff"
                out.append('<Compare kind="%s" title="%s">\n\n%s\n\n</Compare>' % (kind, html.escape(title, quote=True), self.inline(c).strip()))
            elif c.name == "div" and "cards" in cls:
                self.uses.update(["CardGrid", "LinkCard"])
                cards = []
                for a in c.find_all("a", class_="card"):
                    t = a.find("b").get_text().strip(); d = a.find("span").get_text().strip()
                    cards.append('  <LinkCard title="%s" href="%s" description="%s" />' % (html.escape(t, quote=True), self.href(a["href"]), html.escape(d, quote=True)))
                out.append("<CardGrid>\n" + "\n".join(cards) + "\n</CardGrid>")
            elif c.name == "pre": out.append("```\n" + c.get_text() + "\n```")
            elif c.name in ("div", "section"): out.append(self.block(c, depth))
            else: out.append(self.inline(c).strip())
        return "\n\n".join(x for x in out if x)

    def li(self, li, mark):
        # a list item: its own text, then any nested lists indented under it
        parts, rest = [], []
        for c in li.children:
            if isinstance(c, Tag) and c.name in ("ul", "ol"): rest.append(c)
            else: parts.append(c)
        tmp = BeautifulSoup("<x></x>", "html.parser").x
        for p in parts: tmp.append(p.__copy__() if isinstance(p, Tag) else NavigableString(str(p)))
        text = self.inline(tmp).strip()
        s = mark + text
        for sub in rest:
            for j, sli in enumerate(sub.find_all("li", recursive=False), 1):
                s += "\n   " + self.li(sli, ("%d. " % j) if sub.name == "ol" else "- ")
        return s

pages = {}
all_anchors = {}
for f in sorted(os.listdir(SRC)):
    if not f.endswith(".html"): continue
    soup = BeautifulSoup(open(os.path.join(SRC, f), encoding="utf-8").read(), "html.parser")
    wrap = soup.find("div", class_="wrap")
    for junk in wrap.find_all(["footer", "script"]): junk.decompose()
    anchors = {h["id"]: slug(h.get_text()) for h in wrap.find_all(["h2", "h3"]) if h.get("id")}
    all_anchors[f] = anchors
    pages[f] = (soup, wrap, anchors)

for f, (soup, wrap, anchors) in pages.items():
    pg = Page(anchors)
    h1 = wrap.find("h1"); title = h1.get_text().strip(); h1.decompose()
    lede = wrap.find("p", class_="lede"); description = re.sub(r"\s+", " ", lede.get_text()).strip() if lede else ""
    body = pg.block(wrap)
    # links into another page's section: follow that page's new anchors
    def fix(m):
        page, anc = m.group(1), m.group(2)
        return "(%s#%s)" % (page, all_anchors.get(page, {}).get(anc, anc))
    body = re.sub(r"\(([a-z-]+\.html)#([^)]+)\)", fix, body)
    imports = []
    comp = sorted(pg.uses - {"Compare"})
    if comp: imports.append("import { %s } from '@astrojs/starlight/components';" % ", ".join(comp))
    if "Compare" in pg.uses: imports.append("import Compare from '../../components/Compare.astro';")
    fm = "---\ntitle: %s\ndescription: %s\n---\n" % (title.replace(":", " -") if False else '"' + title.replace('"', '\\"') + '"',
                                                       '"' + description.replace('"', '\\"') + '"')
    mdx = fm + ("\n" + "\n".join(imports) + "\n" if imports else "") + "\n" + body.strip() + "\n"
    name = "index.mdx" if f == "index.html" else f.replace(".html", ".mdx")
    open(os.path.join(OUT, name), "w", encoding="utf-8").write(mdx)
    print("%-26s -> %-24s %6d chars, components: %s" % (f, name, len(mdx), ", ".join(sorted(pg.uses)) or "none"))
