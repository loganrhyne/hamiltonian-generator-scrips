# Hamiltonian Lamp Designer (web app)

Interactive, client-side designer for the cylindrical papercraft lamps. Set the
grid (cells around × cells tall), the cell size in mm, and the wall height in
mm; get a live 3D preview of the assembled lamp and two print-ready A4 PDFs.

## Run it

No build step and no network needed (three.js and jsPDF are vendored; the two
Google fonts degrade gracefully offline). Browsers won't load ES modules from
`file://`, so serve the directory:

```
cd app && python3 -m http.server 8000
# -> http://localhost:8000
```

## Controls

- **cols / rows** — grid cells around the circumference / up the height.
  Both must be even (the dual-tree construction needs it); inputs snap.
- **seed / sampler** — `prim` gives bushy, turn-heavy cycles; `backtracker`
  gives longer winding corridors. Same seed → same lamp.
- **cell x / cell y** — cell size in mm. Circumference = cols·cellX, so the
  cylinder diameter is cols·cellX/π; height = rows·cellY.
- **wall height** — how far the wall ribbon stands off the shade, in mm.

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
- `js/pdf.js` — renders the geometry layouts into the two jsPDF documents
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
