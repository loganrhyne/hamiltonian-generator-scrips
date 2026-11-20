#!/usr/bin/env python3
"""Weaving charts for flat Hamiltonian-circuit wall pieces.

A Hamiltonian cycle on a flat W x H cell grid is drawn as a woven sheet of
two-colour paper strips.  Each pattern cell is ``k`` strips wide in both
directions (``k`` odd, default 3), so the sheet is ``k*W`` warp strips
(vertical) by ``k*H`` weft strips (horizontal).  The path is drawn as a
dark line one strip wide through the centre of each cell, extended to the
cell edges it crosses -- so each cell shows its two path "gates" and the two
closed edges stay light.

Two strip schemes
-----------------
``solid``    Every strip is a single colour.  In each cell the strips run
             light, dark, light (for k=3), in both directions.  Where a dark
             strip crosses a light one, which strip is on top sets the colour;
             everywhere else the colour is fixed and over/under is chosen only
             to keep the weave tight.

``checker``  Every strip is cut along one row of a two-colour checkerboard
             (strip width = square size), so it alternates colour at every
             crossing.  Weft strips are laid one square out of phase with the
             warp, so every crossing has one dark and one light strip and
             every crossing is a free pixel.  Areas of one colour come out as
             plain weave.  Works for a three-tone check too: strips cut along
             a band are one two-tone pair, strips cut between bands another.

Outputs
-------
* ``<out>_chart.svg``   crossing-by-crossing chart: fill = visible colour,
                        tick = which strip is on top, bold lines = cell edges
* ``<out>_proof.svg``   what the finished piece looks like, at real size
* ``<out>_rows.txt``    warp layout, plus one line per weft pass written as
                        run lengths, e.g. ``O2 U1 O3`` (O = weft over warp)

Usage::

    python weave_chart.py 8 6 --seed 7 --scheme checker --square 10 --out piece
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Dict, List, Set, Tuple

from dual_tree_cycle import Cycle, generate_cycle, verify_cycle

Point = Tuple[int, int]
DARK, LIGHT = 1, 0
INK = {DARK: "#262626", LIGHT: "#f2efe8"}


@dataclass
class Weave:
    cycle: Cycle
    k: int
    scheme: str
    image: List[List[int]]   # [r][c] visible colour wanted
    warp: List[List[int]]    # [r][c] colour of the warp strip at that crossing
    weft: List[List[int]]    # [r][c] colour of the weft strip at that crossing
    over: List[List[bool]]   # [r][c] True = weft on top
    free: List[List[bool]]   # [r][c] True = over/under did not affect colour

    @property
    def rows(self) -> int:
        return len(self.image)

    @property
    def cols(self) -> int:
        return len(self.image[0])


# ─────────────────── target image ───────────────────
def path_gates(cycle: Cycle) -> Dict[Point, Set[str]]:
    """For each cell, the sides (N/S/E/W) the path leaves through."""
    gates: Dict[Point, Set[str]] = {p: set() for p in cycle.path}
    path = cycle.path
    for a, b in zip(path, path[1:] + path[:1]):
        dr, dc = b[0] - a[0], b[1] - a[1]
        side = {(-1, 0): "N", (1, 0): "S", (0, 1): "E", (0, -1): "W"}.get((dr, dc))
        if side is None:
            raise ValueError(f"non-adjacent step {a} -> {b} (flat grids only)")
        opposite = {"N": "S", "S": "N", "E": "W", "W": "E"}[side]
        gates[a].add(side)
        gates[b].add(opposite)
    return gates


def target_image(cycle: Cycle, k: int) -> List[List[int]]:
    """Dark centre line through each cell, out to the two gate edges."""
    h = k // 2
    img = [[LIGHT] * (cycle.width * k) for _ in range(cycle.height * k)]
    for (r, c), sides in path_gates(cycle).items():
        r0, c0 = r * k + h, c * k + h
        img[r0][c0] = DARK
        for t in range(1, h + 1):
            if "N" in sides:
                img[r0 - t][c0] = DARK
            if "S" in sides:
                img[r0 + t][c0] = DARK
            if "W" in sides:
                img[r0][c0 - t] = DARK
            if "E" in sides:
                img[r0][c0 + t] = DARK
    return img


# ─────────────────── strip colours ───────────────────
def strip_colours(scheme: str, rows: int, cols: int, k: int):
    h = k // 2
    if scheme == "solid":
        warp = [[DARK if c % k == h else LIGHT for c in range(cols)] for _ in range(rows)]
        weft = [[DARK if r % k == h else LIGHT for _ in range(cols)] for r in range(rows)]
    elif scheme == "checker":
        # warp strip c starts dark at the top when c is even; weft strips are
        # shifted one square, so the two strips at a crossing always differ.
        warp = [[DARK if (r + c) % 2 == 0 else LIGHT for c in range(cols)] for r in range(rows)]
        weft = [[LIGHT if (r + c) % 2 == 0 else DARK for c in range(cols)] for r in range(rows)]
    else:
        raise ValueError(f"unknown scheme {scheme!r}")
    return warp, weft


# ─────────────────── over / under ───────────────────
def solve(cycle: Cycle, *, k: int = 3, scheme: str = "solid") -> Weave:
    if k < 3 or k % 2 == 0:
        raise ValueError("k (strips per cell) must be odd and >= 3")
    img = target_image(cycle, k)
    R, C = len(img), len(img[0])
    warp, weft = strip_colours(scheme, R, C, k)
    over = [[False] * C for _ in range(R)]
    free = [[False] * C for _ in range(R)]

    for r in range(R):
        for c in range(C):
            want, wa, we = img[r][c], warp[r][c], weft[r][c]
            if wa != we:
                over[r][c] = (we == want)
                continue
            if wa != want:
                raise AssertionError(f"crossing ({r},{c}) cannot show colour {want}")
            free[r][c] = True

    # Free crossings come in two kinds (solid scheme only; checker has none).
    # Light-on-light crossings get plain-weave parity: around each grid vertex
    # that alternates, so a light strip never floats past its constrained
    # neighbours by more than 2.  Dark-on-dark crossings are cell centres:
    # pick the opposite of the arms either side, which always agree in at
    # least one direction for a straight cell, keeping floats to 3.
    for r in range(R):
        for c in range(C):
            if not free[r][c]:
                continue
            if warp[r][c] == LIGHT:
                over[r][c] = (r + c) % 2 == 0
                continue
            row = [over[r][x] for x in (c - 1, c + 1) if 0 <= x < C and not free[r][x]]
            col = [over[y][c] for y in (r - 1, r + 1) if 0 <= y < R and not free[y][c]]
            if row and all(v == row[0] for v in row):
                over[r][c] = not row[0]
            elif col and all(v == col[0] for v in col):
                over[r][c] = not col[0]
            else:
                over[r][c] = (r + c) % 2 == 0
    return Weave(cycle, k, scheme, img, warp, weft, over, free)


def max_floats(w: Weave) -> Tuple[int, int]:
    """Longest run of one strip staying on the same side: (weft, warp)."""
    def longest(seq):
        best = cur = 1
        for a, b in zip(seq, seq[1:]):
            cur = cur + 1 if a == b else 1
            best = max(best, cur)
        return best
    weft = max(longest(row) for row in w.over)
    warp = max(longest([w.over[r][c] for r in range(w.rows)]) for c in range(w.cols))
    return weft, warp


def visible(w: Weave, r: int, c: int) -> int:
    return w.weft[r][c] if w.over[r][c] else w.warp[r][c]


# ─────────────────── outputs ───────────────────
def runs(seq: List[bool]) -> str:
    out, prev, n = [], seq[0], 0
    for v in seq:
        if v == prev:
            n += 1
        else:
            out.append(f"{'O' if prev else 'U'}{n}")
            prev, n = v, 1
    out.append(f"{'O' if prev else 'U'}{n}")
    return " ".join(out)


def write_rows(w: Weave, filename: str, *, square: float, margin: float) -> None:
    L: List[str] = []
    L.append(f"Weaving chart: {w.cycle.width} x {w.cycle.height} cells, "
             f"{w.k} strips per cell, scheme '{w.scheme}'")
    L.append(f"Warp: {w.cols} vertical strips, each {w.rows} squares long "
             f"({w.rows * square + 2 * margin:.0f} mm with {margin:.0f} mm fold-back each end)")
    L.append(f"Weft: {w.rows} horizontal strips, each {w.cols} squares long "
             f"({w.cols * square + 2 * margin:.0f} mm with {margin:.0f} mm fold-back each end)")
    L.append(f"Finished weave: {w.cols * square:.0f} x {w.rows * square:.0f} mm at {square:g} mm strips")
    fw, fv = max_floats(w)
    L.append(f"Longest float: weft {fw}, warp {fv} crossings")
    L.append("")
    if w.scheme == "solid":
        L.append("Warp layout, left to right (D = dark strip, L = light strip):")
        L.append("  " + "".join("D" if w.warp[0][c] else "L" for c in range(w.cols)))
        L.append("Weft colours, top to bottom, are the same pattern.")
    else:
        L.append("All strips are cut from the checkerboard, one square wide.")
        L.append("Warp strip c (from the left) has a DARK square at the top when c is even (c = 0, 2, 4...).")
        L.append("Weft strip r (from the top) has a DARK square at the left when r is odd (r = 1, 3, 5...),")
        L.append("so at every crossing one strip is dark and the other light.")
    L.append("")
    L.append("Weft passes, top to bottom, read left to right. O = weft over the warp, U = under.")
    for r in range(w.rows):
        tag = ""
        if w.scheme == "solid":
            tag = " (dark)" if w.weft[r][0] else " (light)"
        L.append(f"row {r + 1:3d}{tag:8s} {runs(w.over[r])}")
    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


def write_chart_svg(w: Weave, filename: str, *, px: float = 14.0) -> None:
    pad = 2.5 * px
    W, H = w.cols * px + 2 * pad, w.rows * px + 2 * pad
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" '
         f'viewBox="0 0 {W:.1f} {H:.1f}" font-family="Helvetica, Arial, sans-serif">',
         f'<rect width="{W:.1f}" height="{H:.1f}" fill="white"/>']
    for r in range(w.rows):
        for c in range(w.cols):
            x, y = pad + c * px, pad + r * px
            v = visible(w, r, c)
            s.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{px:.1f}" height="{px:.1f}" '
                     f'fill="{INK[v]}" stroke="#999" stroke-width="0.4"/>')
            # tick along the strip that is on top
            tick = "#d9d4c7" if v == DARK else "#8a857a"
            m, q = px / 2, px * 0.28
            if w.over[r][c]:
                s.append(f'<line x1="{x + m - q:.1f}" y1="{y + m:.1f}" x2="{x + m + q:.1f}" '
                         f'y2="{y + m:.1f}" stroke="{tick}" stroke-width="1"/>')
            else:
                s.append(f'<line x1="{x + m:.1f}" y1="{y + m - q:.1f}" x2="{x + m:.1f}" '
                         f'y2="{y + m + q:.1f}" stroke="{tick}" stroke-width="1"/>')
    for i in range(0, w.rows + 1, w.k):
        y = pad + i * px
        s.append(f'<line x1="{pad:.1f}" y1="{y:.1f}" x2="{pad + w.cols * px:.1f}" y2="{y:.1f}" '
                 f'stroke="#c0392b" stroke-width="1.2"/>')
    for j in range(0, w.cols + 1, w.k):
        x = pad + j * px
        s.append(f'<line x1="{x:.1f}" y1="{pad:.1f}" x2="{x:.1f}" y2="{pad + w.rows * px:.1f}" '
                 f'stroke="#c0392b" stroke-width="1.2"/>')
    fs = px * 0.6
    for r in range(w.rows):
        s.append(f'<text x="{pad - 4:.1f}" y="{pad + (r + 0.7) * px:.1f}" font-size="{fs:.1f}" '
                 f'text-anchor="end" fill="#555">{r + 1}</text>')
    for c in range(w.cols):
        s.append(f'<text x="{pad + (c + 0.5) * px:.1f}" y="{pad - 4:.1f}" font-size="{fs:.1f}" '
                 f'text-anchor="middle" fill="#555">{c + 1}</text>')
    s.append(f'<text x="{pad:.1f}" y="{H - pad / 3:.1f}" font-size="{fs:.1f}" fill="#555">'
             f'tick across = weft on top, tick down = warp on top; red lines = cell edges</text>')
    s.append("</svg>")
    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(s))


def write_proof_svg(w: Weave, filename: str, *, square: float) -> None:
    Wmm, Hmm = w.cols * square, w.rows * square
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{Wmm:g}mm" height="{Hmm:g}mm" '
         f'viewBox="0 0 {Wmm:g} {Hmm:g}">']
    for r in range(w.rows):
        for c in range(w.cols):
            s.append(f'<rect x="{c * square:g}" y="{r * square:g}" width="{square:g}" '
                     f'height="{square:g}" fill="{INK[visible(w, r, c)]}"/>')
    s.append("</svg>")
    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(s))


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--json", dest="json_file", help="flat cycle JSON from dual_tree_cycle --no-wrap")
    src.add_argument("--size", nargs=2, type=int, metavar=("W", "H"), help="generate a W x H cell cycle")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--tree", choices=["prim", "backtracker"], default="prim")
    ap.add_argument("--scheme", choices=["solid", "checker"], default="solid")
    ap.add_argument("--k", type=int, default=3, help="strips per cell (odd, >= 3)")
    ap.add_argument("--square", type=float, default=10.0, help="strip width / checker square (mm)")
    ap.add_argument("--margin", type=float, default=15.0, help="fold-back allowance per strip end (mm)")
    ap.add_argument("--out", default="weave", help="output basename")
    a = ap.parse_args(argv)

    if a.json_file:
        with open(a.json_file, encoding="utf-8") as f:
            d = json.load(f)
        cycle = Cycle(d["width"], d["height"], [tuple(p) for p in d["path"]])
    else:
        cycle = generate_cycle(*a.size, seed=a.seed, tree=a.tree, wrap=False)
    ok, msg = verify_cycle(cycle, wrap=False)
    if not ok:
        raise SystemExit(f"not a flat Hamiltonian cycle: {msg}")

    w = solve(cycle, k=a.k, scheme=a.scheme)
    write_chart_svg(w, f"{a.out}_chart.svg")
    write_proof_svg(w, f"{a.out}_proof.svg", square=a.square)
    write_rows(w, f"{a.out}_rows.txt", square=a.square, margin=a.margin)
    fw, fv = max_floats(w)
    print(f"{cycle.width}x{cycle.height} cells -> {w.cols} warp x {w.rows} weft strips, "
          f"{w.cols * a.square:.0f} x {w.rows * a.square:.0f} mm; longest float weft {fw} / warp {fv}")
    print(f"wrote {a.out}_chart.svg, {a.out}_proof.svg, {a.out}_rows.txt")


if __name__ == "__main__":
    main()
