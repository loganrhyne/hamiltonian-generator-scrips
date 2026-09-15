#!/usr/bin/env python3
"""Printable wall templates for cylindrical Hamiltonian-cycle lampshades.

Pipeline stage that consumes a cycle produced by ``dual_tree_cycle.py`` (or its
JSON) and emits physical, printable templates:

* ``<name>_full.svg``     — the whole unrolled cylinder wall layout at true mm
                            scale (for large-format printing or laser cutting);
* ``<name>_pageR#C#.svg`` — A4 tiles with crop marks, page labels and a marked
                            glue seam, for taping together on a home printer;
* ``<name>_preview.png``  — a proof showing the walls plus the page grid.

The unrolled width is the cylinder circumference (pi * diameter); the height is
the cylinder height.  The cycle's seam edges are drawn as half-cell stubs on
both the left and right ends so the sheet's path stays continuous when rolled.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from dataclasses import dataclass
from typing import List, Tuple

from dual_tree_cycle import Cycle, _cycle_segments, generate_cycle, verify_cycle

A4_W, A4_H = 210.0, 297.0  # mm, portrait


@dataclass
class Sheet:
    """The unrolled template in mm. Origin (0,0) at the sheet's top-left."""

    width_mm: float
    height_mm: float
    cell_w: float
    cell_h: float
    wall_mm: float
    segments: List[Tuple[float, float, float, float]]  # x1,y1,x2,y2 in mm


def load_cycle(path: str) -> Cycle:
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    return Cycle(width=d["width"], height=d["height"],
                 path=[tuple(p) for p in d["path"]])


def build_sheet(cycle: Cycle, *, wall_mm: float,
                diameter_mm: float | None = None, height_mm: float | None = None,
                cell_w_mm: float | None = None, cell_h_mm: float | None = None,
                wrap: bool = True) -> Sheet:
    """Scale a cycle to a real cylinder. Columns -> circumference, rows -> height.

    Provide either explicit cell sizes (``cell_w_mm`` + ``cell_h_mm``) or the
    cylinder dimensions (``diameter_mm`` + ``height_mm``), from which the cell
    sizes are derived.
    """
    W, H = cycle.width, cycle.height
    if cell_w_mm is not None or cell_h_mm is not None:
        if cell_w_mm is None or cell_h_mm is None:
            raise ValueError("give both cell_w_mm and cell_h_mm")
        cell_w, cell_h = cell_w_mm, cell_h_mm
    else:
        if diameter_mm is None or height_mm is None:
            raise ValueError("give diameter_mm + height_mm, or cell_w_mm + cell_h_mm")
        cell_w = (math.pi * diameter_mm) / W
        cell_h = height_mm / H
    # _cycle_segments works in cell space with x=col, y=row, seam stubs at
    # x=-0.5 and x=W-0.5; shift right by half a cell so content starts at 0.
    segs: List[Tuple[float, float, float, float]] = []
    for x1, y1, x2, y2 in _cycle_segments(cycle, wrap=wrap):
        segs.append((
            (x1 + 0.5) * cell_w, (y1 + 0.5) * cell_h,
            (x2 + 0.5) * cell_w, (y2 + 0.5) * cell_h,
        ))
    return Sheet(width_mm=W * cell_w, height_mm=H * cell_h,
                 cell_w=cell_w, cell_h=cell_h, wall_mm=wall_mm, segments=segs)


# ─────────────────── SVG helpers ───────────────────
def _svg_header(w: float, h: float, view: str | None = None) -> str:
    vb = view if view else f"0 0 {w:.2f} {h:.2f}"
    return (f'<?xml version="1.0" encoding="utf-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.2f}mm" '
            f'height="{h:.2f}mm" viewBox="{vb}">\n')


def _walls_group(segs, wall_mm: float, *, cut_guide: bool = True) -> str:
    """Walls as a stroked path (material footprint) + thin centreline cut guide."""
    out = [f'<g stroke="#111" stroke-width="{wall_mm:.3f}" fill="none" '
           f'stroke-linecap="round" stroke-linejoin="round" opacity="0.85">']
    for x1, y1, x2, y2 in segs:
        out.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}"/>')
    out.append("</g>")
    if cut_guide:
        out.append('<g stroke="#d00" stroke-width="0.2" fill="none">')
        for x1, y1, x2, y2 in segs:
            out.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}"/>')
        out.append("</g>")
    return "\n".join(out)


def write_full_svg(sheet: Sheet, filename: str) -> None:
    parts = [_svg_header(sheet.width_mm, sheet.height_mm)]
    # border + seam markers (left & right edges are the glue seam)
    parts.append(f'<rect x="0" y="0" width="{sheet.width_mm:.2f}" '
                 f'height="{sheet.height_mm:.2f}" fill="none" stroke="#999" '
                 f'stroke-width="0.3" stroke-dasharray="2 2"/>')
    for x in (0.0, sheet.width_mm):
        parts.append(f'<line x1="{x:.2f}" y1="0" x2="{x:.2f}" '
                     f'y2="{sheet.height_mm:.2f}" stroke="#06c" stroke-width="0.4" '
                     f'stroke-dasharray="4 2"/>')
    parts.append(_walls_group(sheet.segments, sheet.wall_mm))
    parts.append(f'<text x="2" y="{sheet.height_mm - 2:.2f}" font-size="4" '
                 f'fill="#06c">glue seam (both blue edges meet)</text>')
    parts.append("</svg>")
    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def write_a4_pages(sheet: Sheet, base: str, *, margin: float = 8.0) -> List[str]:
    """Tile the sheet onto A4 portrait pages. Returns the list of filenames."""
    usable_w = A4_W - 2 * margin
    usable_h = A4_H - 2 * margin
    ncol = max(1, math.ceil(sheet.width_mm / usable_w))
    nrow = max(1, math.ceil(sheet.height_mm / usable_h))
    files: List[str] = []
    for r in range(nrow):
        for c in range(ncol):
            ox, oy = c * usable_w, r * usable_h  # template-space origin of this tile
            # viewBox shows the page window in template coords, offset by margin
            view = f"{ox - margin:.2f} {oy - margin:.2f} {A4_W:.2f} {A4_H:.2f}"
            parts = [_svg_header(A4_W, A4_H, view)]
            # clip to usable area so neighbouring tiles don't bleed
            parts.append(f'<clipPath id="clip"><rect x="{ox:.2f}" y="{oy:.2f}" '
                         f'width="{usable_w:.2f}" height="{usable_h:.2f}"/></clipPath>')
            parts.append('<g clip-path="url(#clip)">')
            parts.append(_walls_group(sheet.segments, sheet.wall_mm))
            # seam line if this tile touches the left or right sheet edge
            for ex in (0.0, sheet.width_mm):
                if ox - 1 <= ex <= ox + usable_w + 1:
                    parts.append(f'<line x1="{ex:.2f}" y1="{oy:.2f}" x2="{ex:.2f}" '
                                 f'y2="{oy + usable_h:.2f}" stroke="#06c" '
                                 f'stroke-width="0.4" stroke-dasharray="4 2"/>')
            parts.append("</g>")
            # crop marks at the usable-area corners
            for cx, cy in [(ox, oy), (ox + usable_w, oy),
                           (ox, oy + usable_h), (ox + usable_w, oy + usable_h)]:
                parts.append(f'<path d="M{cx - 3:.2f} {cy:.2f} h6 M{cx:.2f} {cy - 3:.2f} '
                             f'v6" stroke="#000" stroke-width="0.3"/>')
            parts.append(f'<text x="{ox + 2:.2f}" y="{oy + 5:.2f}" font-size="4" '
                         f'fill="#888">R{r + 1}C{c + 1} of R{nrow}C{ncol}</text>')
            parts.append("</svg>")
            fn = f"{base}_page_R{r + 1}C{c + 1}.svg"
            with open(fn, "w", encoding="utf-8") as f:
                f.write("\n".join(parts))
            files.append(fn)
    return files


def write_preview_png(sheet: Sheet, filename: str, *, margin: float = 8.0) -> None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.collections import LineCollection
    except Exception as exc:  # pragma: no cover
        print(f"matplotlib unavailable ({exc}); skipping preview")
        return
    usable_w = A4_W - 2 * margin
    usable_h = A4_H - 2 * margin
    ncol = max(1, math.ceil(sheet.width_mm / usable_w))
    nrow = max(1, math.ceil(sheet.height_mm / usable_h))
    fig, ax = plt.subplots(figsize=(max(3, sheet.width_mm / 25),
                                    max(3, sheet.height_mm / 25)))
    segs = [((x1, y1), (x2, y2)) for x1, y1, x2, y2 in sheet.segments]
    ax.add_collection(LineCollection(segs, colors="#111",
                                     linewidths=sheet.wall_mm, alpha=0.85,
                                     capstyle="round", joinstyle="round"))
    # page grid overlay
    for c in range(ncol + 1):
        ax.axvline(c * usable_w, color="#39c", lw=0.6, ls="--")
    for r in range(nrow + 1):
        ax.axhline(r * usable_h, color="#39c", lw=0.6, ls="--")
    # seam edges
    for x in (0, sheet.width_mm):
        ax.axvline(x, color="#06c", lw=1.0)
    ax.set_xlim(-2, sheet.width_mm + 2)
    ax.set_ylim(-2, sheet.height_mm + 2)
    ax.invert_yaxis()
    ax.set_aspect("equal")
    ax.set_title(f"Unrolled template {sheet.width_mm:.0f}×{sheet.height_mm:.0f} mm "
                 f"— {ncol}×{nrow} A4 pages (blue = glue seam)", fontsize=8)
    ax.set_xlabel("circumference (mm)", fontsize=7)
    ax.set_ylabel("height (mm)", fontsize=7)
    fig.tight_layout()
    fig.savefig(filename, dpi=130, bbox_inches="tight")
    plt.close(fig)


# ─────────────────── CLI ───────────────────
def main(argv=None) -> None:
    ap = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter, description=__doc__)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--json", dest="json_file", help="cycle JSON from dual_tree_cycle")
    src.add_argument("--size", nargs=2, type=int, metavar=("W", "H"),
                     help="generate a fresh cycle of this even size instead")
    ap.add_argument("--seed", type=int, default=None, help="seed when using --size")
    ap.add_argument("--tree", choices=["prim", "backtracker"], default="prim")
    ap.add_argument("--diameter", type=float, default=120.0, help="cylinder diameter (mm)")
    ap.add_argument("--height", type=float, default=300.0, help="cylinder height (mm)")
    ap.add_argument("--cell", nargs=2, type=float, metavar=("CW", "CH"),
                    help="explicit cell width,height in mm (overrides --diameter/--height)")
    ap.add_argument("--wall", type=float, default=3.0, help="wall thickness / extrusion (mm)")
    ap.add_argument("--margin", type=float, default=8.0, help="A4 print margin (mm)")
    ap.add_argument("--out", default="template", help="output basename")
    ap.add_argument("--no-pages", action="store_true", help="skip A4 tiling")
    args = ap.parse_args(argv)

    if args.json_file:
        cycle = load_cycle(args.json_file)
    else:
        cycle = generate_cycle(*args.size, seed=args.seed, tree=args.tree, wrap=True)
    ok, msg = verify_cycle(cycle, wrap=True)
    if not ok:
        raise SystemExit(f"input cycle invalid: {msg}")

    if args.cell:
        sheet = build_sheet(cycle, wall_mm=args.wall,
                            cell_w_mm=args.cell[0], cell_h_mm=args.cell[1])
    else:
        sheet = build_sheet(cycle, wall_mm=args.wall,
                            diameter_mm=args.diameter, height_mm=args.height)
    diameter = sheet.width_mm / math.pi
    print(f"cycle {cycle.width}x{cycle.height} -> sheet "
          f"{sheet.width_mm:.1f}×{sheet.height_mm:.1f} mm  "
          f"(cell {sheet.cell_w:.1f}×{sheet.cell_h:.1f} mm, wall {sheet.wall_mm} mm)")
    print(f"  => cylinder Ø{diameter:.1f} mm × {sheet.height_mm:.0f} mm tall "
          f"(circumference {sheet.width_mm:.1f} mm)")

    write_full_svg(sheet, f"{args.out}_full.svg")
    print(f"full SVG -> {args.out}_full.svg")
    write_preview_png(sheet, f"{args.out}_preview.png", margin=args.margin)
    print(f"preview  -> {args.out}_preview.png")
    if not args.no_pages:
        files = write_a4_pages(sheet, args.out, margin=args.margin)
        print(f"A4 pages -> {len(files)} files ({os.path.basename(files[0])} …)")


if __name__ == "__main__":
    main()
