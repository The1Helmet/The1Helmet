# ⛑ Helmet CAD

A simple **2D Computer-Assisted-Design / drafting tool** for theoretical-mechanics
schematics — statics "free-body" diagrams and kinematics mechanism diagrams like
the reference PDFs (`Dvieju_kunu_sistema`, `Kinematikos`). Think *SolidWorks
sketch mode, but 2D-only and stripped down to just what you need to draft a
document*: spawn prefab objects, drag them into place, tweak their dimensions,
and annotate with Smart Dimensions.

> Built with Electron + an SVG drawing engine. It also runs in a plain browser.

![sample](docs/sample.png)

## Run it

**Desktop (Electron):**
```bash
npm install        # installs electron
npm start
```

**In a browser (no install needed):**
```bash
npm run web        # serves at http://localhost:5173
```

## How it works

- **Left panel — Prefab palette.** Click a prefab, then click on the canvas to
  place it. Single-click prefabs drop in one spot; multi-click ones let you set
  endpoints (e.g. a *Link* = 2 clicks, an *Angular dimension* = 3 clicks: vertex,
  arm 1, arm 2). Press **Esc** to finish/cancel and return to Select.
- **Canvas — Draft here.** Pan with middle-mouse or **Space-drag**, zoom with the
  wheel. The cursor **snaps** to joints, endpoints and the grid (orange marker).
- **Right panel — Properties.** Select an object to edit every dimension/parameter
  (length, angle, thickness, radius, labels, colors…). Drag the blue square
  **handles** on a selected object to reshape it directly.

### Prefab library

| Category | Objects |
|---|---|
| **Structure** | Pin joint, Link/bar, Piston / cylinder |
| **Supports** | Fixed wall (ground hatch), Pin support (hinge), Roller support, Slider-in-slot |
| **Loads** | Force (point load), Distributed load (uniform / triangular), Moment |
| **Vectors** | Vector (v / a), Angular velocity ω, Coordinate axes |
| **Dimensions** | Linear, Angular, Radius / diameter, Coordinate |
| **Annotation** | Text label |

### Smart Dimension

The four dimension prefabs measure live geometry and show editable values:

- **Linear** — distance with extension lines + arrows; set unit & decimals, or
  override the text.
- **Angular** — angle between two surfaces/arms shown as an arc in degrees.
- **Radius / diameter** — leader + `R` or `⌀` value.
- **Coordinate** — a point's `(x, y)`.

### Files

- **Save / Open** native `*.hcad.json` project files (Ctrl+S / Ctrl+O). In the
  browser these become download / upload.
- **Blueprint** (Ctrl+B) is a reserved slot for the next feature — a printable
  sheet with border + title block and PDF/SVG export. The engine already renders
  to vector world-space, so it can wrap the current scene unchanged.

## Keyboard

| | |
|---|---|
| Select / move | default tool |
| Pan | middle-drag or Space-drag |
| Zoom | wheel · `Ctrl+0` fit · `Ctrl +/-` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Delete · Duplicate · Select all | `Del` · `Ctrl+D` · `Ctrl+A` |
| Toggle grid · snap | `G` · `Ctrl+Shift+G` |
| Finish / cancel placement | `Esc` |

## Project layout

```
main.js / preload.js   Electron shell, menus, native Save/Open
serve.js               tiny static server for the browser mode
app/index.html,css     UI shell
app/js/
  geometry.js          vector math + snapping helpers
  camera.js            pan/zoom world↔screen transform
  renderer.js          SVG "pen" (world-space drawing primitives) + grid
  entities.js          parametric prefab definitions (draw/handles/params)
  prefabs.js           palette catalog
  store.js             document model + undo/redo + save/load
  tools.js             pointer tools: select / move / handles / place / snap
  panels.js            palette + properties UI
  blueprint.js         reserved stub for the future Blueprint feature
  main.js              app bootstrap & event wiring
```
