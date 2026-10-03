# 454 Workshop licensing

**All of 454 Workshop is free and open source, under the MIT licence.** That means 454 Control, 454 Design
with its toolpaths and G-code (the CAM engine), every file import, the docs, and the desktop app. There is no
paid version, no licence key and no account, and none is planned.

Use it, change it and share it. The full terms are in [`LICENSE`](LICENSE).

## What that covers

| Part | Includes |
| --- | --- |
| **454 Control** | Connecting, homing, jogging, probing (BitSetter and BitZero), running jobs, overrides, recovery, checks and the preview. |
| **454 Design** | Drawing, editing, dimensions, layers, sheets, nesting and text; toolpaths (profiles, pockets, drilling, chamfers, V-carving, inlays), the tool library, previews, job sheets and G-code. |
| **File import** | VCarve (`.crv`) and Carbide Create (`.c2d`) projects, DXF, SVG, and pictures to trace. |
| **The desktop app** | Both apps and the docs in one Windows app, with updates. |

Versions already published under MIT stay MIT. Nothing that has been free becomes paid.

## The libraries it uses

The desktop app includes these open-source libraries, each under its own licence: Electron, three.js,
opentype.js, sql.js, and fonts from Fontsource. The browser versions load the same libraries from public
networks.

## Contributions

Contributions are accepted under the MIT licence, the same as the rest of the project.

## Notes (not legal advice)

- **Reading other programs' files.** The VCarve and Carbide Create importers read files that you made, so you
  can bring your own work across. They contain none of those programs' code. The VCarve importer was written by
  studying how the files are laid out, with nothing decompiled; the Carbide Create importer from project files
  and the G-code Carbide Create made from them.
- **Names.** 454 Workshop isn't connected with or endorsed by Carbide 3D, Vectric or General Motors. Their
  product names are used only to say what 454 Workshop works with.

## History

An earlier version of this file, drafted in September 2026 before the toolpaths existed, planned to sell the
CAM engine as a separate paid product. That plan was dropped: the CAM engine was built in this repository
under MIT, and is part of the free app.
