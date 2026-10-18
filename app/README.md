# Hamiltonian Lamp Designer (web app)

Interactive, client-side designer for the cylindrical papercraft lamps. Set the
grid (cells around × cells tall), the cell size in mm, and the wall height in
mm; get a live preview of the assembled lamp — in 3D or unrolled flat — and
two print-ready A4 PDFs.

## Run it

No build step and no network needed (three.js and jsPDF are vendored; the two
Google fonts degrade gracefully offline). Browsers won't load ES modules from
`file://`, so serve the directory:

```
cd app && python3 -m http.server 8000
# -> http://localhost:8000
```

## Views

The stage has three view tabs in flat-panel mode:

- **3d** — the assembled lamp: translucent shade, inward wall ribbon, warm bulb.
  Drag to orbit, scroll to zoom.
- **3d path** — the retained paper/acetate from the panel template, assembled
  around the same prism without wood obscuring it. Blue lines are cut edges;
  amber lines mark where retained path meets the adjacent panel, including the
  closing seam. Open gaps stay open. These are sheet surfaces, not simulated
  paper thickness or added glue tabs; the lines show where joining is needed,
  not a designed fastening. Switching between 3d and 3d path keeps the camera.
- **unrolled** — the cylinder cut open and laid flat: a light cell grid with the
  Hamiltonian path drawn over it, in the same frame the tile PDF prints in
  (x = circumference, y = height, origin top-left). The dashed verticals are the
  glue seam, so the two edges meet when rolled. Drag to pan, scroll (or pinch)
  to zoom about the cursor, double-click to refit. The grid is dropped
  automatically when cells fall below ~6 px on screen, where it reads as noise,
  and comes back as you zoom in. Framing survives a seed reroll and refits when
  the sheet's dimensions change.

## Controls

- **cols / rows** — grid cells around the circumference / up the height.
  Both must be even (the dual-tree construction needs it); inputs snap.
- **seed / sampler** — `prim` gives bushy, turn-heavy cycles; `backtracker`
  gives longer winding corridors. Same seed → same lamp.
- **cell x / cell y** — cell size in mm. Circumference = cols·cellX, so the
  cylinder diameter is cols·cellX/π; height = rows·cellY.
- **wall height** — how far the wall ribbon stands off the shade, in mm.

## Build methods

- **papercraft cylinder** — the original: a rolled paper shade with the wall
  ribbon folded from printed pieces (outputs below).
- **wood on acetate · flat panels** — the unrolled cycle split into N flat
  panels of a prism (3 triangle, 4 square, 5, 6 hexagon, 8 octagon). Print the
  template, lay acetate over it, glue square-section wood strips (e.g. 5 mm
  walnut) on the brown bars, then cut the grey areas out of the acetate. The
  path is the corridor that stays: its wall faces sit **inset** mm in from the
  grid lines wherever the path doesn't cross, so two runs side by side leave a
  2·inset gap straddling the grid line. Light passes straight through the gaps;
  the path between the walls diffuses it.
  - **panels / inset / strip / stock length** set the prism, the gap, the strip
    section and the stick length (runs longer than a stick are split into
    butt-jointed lengths). `cols` snaps to a multiple of the panel count.
  - Corners: at an outside corner the horizontal strip runs through and the
    vertical one stops one strip width short; at an inside corner the
    horizontal strip runs on one strip width. Horizontal strips that meet a
    panel edge are mitred at 180°/N (45° for a square) with the long point on
    the acetate, so they meet the next panel's strip with walls facing the bulb.
  - **Panel templates** PDF: a cover with the spec, build steps and a lettered
    cut list (count × length, end treatment, stick estimate), then each panel
    tiled on A4 with crop marks; each bar carries its cut-list letter.
  - After cutting, the path is several separate acetate pieces per panel, each
    held where it runs off a panel edge (the count is in the title block), so
    the panels need joining or a frame.

## Outputs (print at 100% scale, never "fit to page")

1. **Wall pieces** (landscape A4) — the wall ribbon unfolded flat and cut into
   numbered pieces with hatched glue tabs. Because the wall extrudes radially
   inward, vertical path runs flatten to straight rectangles but horizontal
   runs flatten to *ring arcs* (outer radius = cylinder radius, inner radius =
   radius − wall height; one cell spans 2π/cols). Pieces chain through 90°
   fold lines at every horizontal↔vertical junction (blue tick past the shade
   edge = left turn, red tick past the free edge = right turn) and are cut
   wherever the flattened chain would overrun the printable area or curl too
   far (the piece is rotated to its chord and kept slim so pages pack
   densely). A dashed colored tab line means that joint is also a 90° corner.
   The last piece's tab closes the loop back onto piece 001.
2. **Path template** (portrait A4) — the unrolled cylinder tiled across pages
   with crop marks and `R#C#` labels; tape them together, transfer the path to
   the shade paper, roll, and glue at the blue dashed seam. Seam-crossing path
   edges appear as half-cell stubs on both edges so the path stays continuous
   when rolled. The cover page shows the whole layout plus the spec block.

## Code layout

- `js/cycle.js` — JS port of `dual_tree_cycle.py` (seeded, O(W·H))
- `js/geometry.js` — mm-scale sheet, strip packing, A4 tiling, 3D mesh data
  (all pure functions, Node-testable)
- `js/viewer.js` — three.js scene (translucent shade, inward wall ribbon,
  warm bulb light)
- `js/unrolled.js` — 2D canvas view of the flat sheet; `fitTransform` is pure
  and Node-testable
- `js/panels.js` — flat-panel build: inset wall layout, cut-away areas, cut
  list, A4 tiling and prism mapping (pure, Node-testable)
- `js/pdf.js` — renders the geometry layouts into the jsPDF documents
- `js/main.js` — UI wiring

## Tests

```
node app/tests/run-tests.mjs
```

Covers cycle validity across sizes up to 100×100 (both samplers, wrap and
flat, plus seed determinism and the contractibility/turning-number invariant),
wall-piece construction (outer-edge length conservation, arc-angle accounting,
fold/joint bookkeeping, element-chain continuity, page fit, packing without
overlaps), tiling coverage, mesh sanity, and performance budgets. At
100×100, generation runs ~1 ms and the full layout pipeline <50 ms in Node;
in-browser rebuild including the 3D mesh is well under a second, and the
100×100 PDFs render in <1 s each.
