# 454 Workshop docs

The documentation at [454workshop.com/docs](https://454workshop.com/docs), built with
[Astro Starlight](https://starlight.astro.build). It's also bundled into the desktop app, where it works
offline, search included.

## Writing

Pages are in `src/content/docs/`, one `.mdx` file each (Markdown, plus components). The sidebar is in
`astro.config.mjs`. Pages build as plain `.html` files, so their addresses never change.

Needs Node.js 22.12 or newer.

```sh
npm ci
npm run dev        # live preview at http://localhost:4321/docs
npm run build      # the finished site, in dist/
```

Components you'll use:

- **Callouts:** `:::tip`, `:::note`, `:::caution` and `:::danger`, each closed with `:::`.
- **Steps**, for numbered procedures: `import { Steps } from '@astrojs/starlight/components'`, then a
  numbered list inside `<Steps>`.
- **Compare** (`src/components/Compare.astro`): a labelled callout, green for "works the same" (as Carbide
  Motion, VCarve or Fusion), blue for a difference.
- **Shot** (`src/components/Shot.astro`): a screenshot, shown true to the app's size, with alt text and an
  optional caption.

## Screenshots

Screenshots are made by code, not by hand: `scripts/shots.cjs` lists each one (which app, how to set it
up, what to capture), and one command retakes them all from the current apps, so the docs keep up with
the interface.

```sh
npm run shots                                # all of them (on Linux without a screen: xvfb-run npm run shots)
SHOTS_ONLY=design-offset npm run shots       # just one, or several separated by commas
```

To add one: add an entry to `scripts/shots.cjs`, run it, check the image in `src/assets/shots/`, then
use it in a page with `<Shot>`. Set each shot up the way a user gets there (select, then press the
tool's key); opening a panel directly can miss the previews a real session shows.
