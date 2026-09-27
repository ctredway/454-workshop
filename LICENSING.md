# 454 Workshop licensing & commercial charter

*Drafted September 2026, before any commercial code exists — so the boundary is a promise
made in advance, not a rug-pull after the fact. This document is the reference for what is
and will remain free, what will be sold, and the rules that keep the two from contaminating
each other.*

---

## The one-paragraph version

Everything in this repository is MIT-licensed and stays that way: the **454 Control** and the
**454 Design**, including all file import (.crv, DXF, SVG), drawing, editing,
dimensioning, and save/load. The future **CAM engine** — the part that turns drawings into
G-code — will be a separate commercial product ("454 Design Pro"), developed outside this
repository, sold as a one-time purchase in the $49 range with EstlCAM-style update terms.
The free tools are the product for most people; Pro is for the people the free tools turned
into believers.

---

## What is free forever (MIT, this repository)

| Component | Includes |
|---|---|
| **454 Control** (`index.html`) | Everything: serial, jog, probing (BitSetter / BitZero), job streaming, overrides, recovery, linting, 3D preview. The sender will never have a paid tier — senders are plumbing, and plumbing is free. |
| **454 Design** (`design.html`) | All drawing tools, precision entry, dimensioning, construction geometry, snapping, guides, edit tools (fillet/trim/extend/offset/copy/mirror/rotate/array/join/explode), the configurable panel, save/load. |
| **All import** | `.crv` (drawing + toolpath-preview extraction), and the coming DXF and SVG importers with scale-to-size. Import is free because migration should never be the thing you pay for — you pay for what you can *do* after migrating. |

Versions already published under MIT remain MIT irrevocably. That is not a loophole to be
managed; it is the design. Nothing that has ever been free becomes paid.

## What will be commercial (454 Design Pro, separate distribution)

The CAM layer — everything between "finished drawing" and "G-code file":

- Toolpath strategies: profile (inside/outside/on, with tabs, lead-in/out, ramping), pocket
  (with clearing passes), drilling; later v-carving and anything beyond.
- Tool database and material/feeds-speeds library.
- Toolpath preview & simulation inside the design environment.
- G-code post-processing (GRBL / Carbide Motion dialect first) and export.
- One-click handoff into 454 Control.

The paywall sits exactly at the value line this market has proven it pays for (Vectric,
EstlCAM, LightBurn, MillMage): **drawings in, G-code out.**

## Why open-core, explicitly

1. **It matches reality.** The sketcher is already published under MIT; open-core requires
   retracting nothing and honors every promise already implicit in the public repo.
2. **It matches the market.** Free senders + paid CAM is the proven shape of this industry.
   The free sketcher is the top of the funnel and the community-goodwill engine; the CAM
   module is the business.
3. **It keeps incentives clean.** The free tools must stay genuinely excellent to earn
   anyone's trust in Pro. A crippled free tier would poison both.

## Repo hygiene rules (the firewall)

- **CAM code never enters this repository.** Not in branches, not in experiments, not in
  gists linked from issues. The moment proprietary logic touches an MIT repo, the boundary
  blurs; the rule is absolute so no judgment calls are ever needed.
- Pro is developed in a **separate private repository** from day one.
- Outside contributions to this repo are accepted under MIT as usual. Contributions cannot
  be accepted into Pro (no CLA machinery, no ambiguity — Pro is single-author by policy).
- Shared geometry code (the intersection kernel, offset math, path model) lives here under
  MIT and Pro *consumes* it. MIT permits that use; the direction of flow is only ever
  public → private, never the reverse.

## Distribution & license-key mechanics

- **Product form:** 454 Design Pro ships as a single self-contained HTML build (the same
  form factor as the free tools — download it, open it, it works offline forever). Optionally
  later: a Tauri-wrapped desktop build from the same source.
- **Sales:** through a merchant-of-record (Lemon Squeezy or Paddle) so VAT/sales-tax
  compliance is their problem, not a one-person company's.
- **License keys, offline-first:** the key is a signed token (Ed25519) encoding the buyer's
  name, email, and purchase date. The public verification key is embedded in the app; the
  app verifies locally. **No license server, no phone-home, no telemetry, works on an
  air-gapped shop PC for the life of the machine.**
- **Honesty about enforcement:** a browser-deliverable app is an honor-system product, the
  same way EstlCAM and LightBurn effectively are. The defense is price (cheap enough that
  paying beats hassle), goodwill (the developer is a known person in the community, not a
  corporation), and the buyer's name rendered in their own title bar. This has worked for a
  decade for the products 454 Workshop is modeled on.

## Pricing intent (subject to reality at launch)

- **$49 one-time**, perpetual license, including **12 months of updates** from first
  activation. Every build you're entitled to works forever.
- After the first year, an optional **update pass** (~$19/yr) for continued updates —
  EstlCAM's exact model, which its community publicly accepted.
- **Early-supporter discount** for the pre-launch mailing list (people who used the free
  tools and asked for CAM get rewarded for being first).
- Anchor positioning: VCarve Desktop is ~$350 and Windows-only. 454 Design Pro at $49
  covers the profile-and-pocket 95% and runs in a browser on anything.

## Sequence

1. **Now → D1.x complete:** everything free, launch both tools on the Shapeoko forum,
   build the user base and the bug-report pipeline (it is already excellent).
2. **Announce intent early:** a plain statement that CAM is coming and will be paid, with
   the early-supporter list open. No surprises later.
3. **D2 development:** in the private repo, against this document's boundary.
4. **Launch Pro** when profile + pocket + tabs + tool DB + GRBL post are field-proven on
   the developer's own machine (the same gauntlet discipline as the sender's 1.0).

## Legal footnotes (not legal advice)

- Before launch: a basic **trademark search on "454 Workshop"** in software. (The project was
  renamed from Kerf for this reason: cheaper before there are customers than after. Avoid GM's
  trademarks, such as Corvette, Stingray, Chevy and Bowtie, in names and marketing.)
- The `.crv` importer reads files the user created, was built by clean-room analysis of
  byte layouts (no Vectric code, no decompilation), and exists for interoperability —
  the classic protected case. It stays free partly because free interop is also the
  strongest legal posture.
- A short EULA and refund policy ship with Pro (merchant-of-record templates cover most
  of it). Have a lawyer skim the final versions before money moves.

---

*Changes to this charter should be rare, deliberate, and only ever in the direction of
making more things free.*
