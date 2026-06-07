# hamiltonian-generator-scrips


This project is the software half of a design exercise to create a collection of lighting artifacts defined by Hamiltonian Cycles.

The initial exploration is to create a cardboard prototype of a cylindrical lampshade where the central illumination is surrounded by a Hamiltonian Cycle path that fills the surface plane of a cylindrical grid and then is projected inwards to create "walls" so the path has dimensionality perpendicular to the vertical axis of the cylinder.

On the software side we need:

- An algorithm to generate valid Hamiltonian cycles for "even" cylindrical grids
- A representation of paths that we can serialize and save
- A simple way to visualize generated paths to check for correctness
- A way to specify "physical" traits like wall thickess and height to visualize the final object as it would exist after construction


## Generators

There are two generators in this repo:

### `dual_tree_cycle.py` — recommended (fast)

Builds the cycle by the **spanning-tree doubling** ("dual tree") construction: a
random spanning tree on the half-resolution `(H/2)×(W/2)` cylindrical super-grid
is "doubled" up to the full grid, merging one little 4-cycle per super-cell into a
single Hamiltonian cycle. It is **O(W·H)** with no search/backtracking, so it stays
fast on large, awkward shapes — a 100×100 cylinder generates in ~10 ms.

```
python dual_tree_cycle.py <width> <height> --seed 42 \
    --tree prim --json out.json --image cycle.png --svg walls.svg --wall-width 6
```

- `--tree {prim,backtracker}` selects the spanning-tree sampler. `prim` is bushier
  (more turns); `backtracker` (randomized DFS) makes longer, winding corridors.
- `--no-wrap` produces a flat sheet instead of a cylinder (no seam).
- `--svg` writes an unrolled wall template; seam-crossing edges are emitted as stubs
  on both edges so the sheet lines up when rolled.
- Output JSON stores the ordered path as `(row, col)` pairs (`"coords": "row,col"`).

Run the tests with `python tests/test_dual_tree.py` (no pytest required).

### `cycle_generator.py` — original

```
python cycle_generator.py <width> <height> --json output.json --image cycle.png \
    --flips 1 --seed 42
```

`--flips 0` gives a deterministic serpentine cycle; `--flips > 0` runs a randomized
Warnsdorff DFS. Note the DFS struggles to *close* a cycle on tall, skinny cylinders
(e.g. 8×40) and can take a very long time there — prefer `dual_tree_cycle.py`.

Both generators require `width` and `height` to be even. PNG output needs `matplotlib`;
edges that cross the cylinder seam are drawn separately on each side to show the wrap.

## Printable templates

`path_to_template.py` turns a cycle into physical, printable wall templates for a
cylindrical lampshade. Columns map to the cylinder **circumference** (π·diameter)
and rows to its **height**, so you give real dimensions in mm:

```
# from a saved cycle:
python path_to_template.py --json cycle.json --diameter 120 --height 300 --wall 3 --out lamp
# or generate one in the same step:
python path_to_template.py --size 8 40 --seed 7 --diameter 120 --height 300 --out lamp
```

It writes:

- `lamp_full.svg` — the whole unrolled wall layout at true mm scale (large-format / laser);
- `lamp_page_R#C#.svg` — A4 tiles with crop marks, page labels and the marked glue seam;
- `lamp_preview.png` — a proof of the walls with the page grid overlaid.

The cycle's seam edges are emitted as half-cell stubs on both the left and right
ends (marked blue), so the path stays continuous when the sheet is rolled and the
two blue edges are glued together. Run its tests with `python tests/test_template.py`.
