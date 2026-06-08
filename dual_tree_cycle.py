#!/usr/bin/env python3
"""Fast Hamiltonian cycles on cylindrical grids via the spanning-tree
("dual tree") doubling construction.

Idea
----
Work on the *half-resolution* super-grid of size ``(H//2) x (W//2)`` whose
columns wrap (a cylinder).  Build a random **spanning tree** of that grid.
Then "double" it back up to the full ``H x W`` grid:

* every super-cell ``(i, j)`` owns the 2x2 block of fine cells
  ``{(2i,2j), (2i,2j+1), (2i+1,2j+1), (2i+1,2j)}`` wired as a little 4-cycle;
* every spanning-tree edge **splices** the two neighbouring 4-cycles together
  (delete the two parallel border edges, add the two perpendicular ones).

A spanning tree on ``N`` nodes has exactly ``N-1`` edges, so the ``N`` little
4-cycles merge into exactly **one** Hamiltonian cycle.  No search, no
backtracking -- O(W*H).  Both width and height must be even.

The columns of the super-grid wrap, so the resulting cycle genuinely crosses
the cylinder seam (fine column W-1 is adjacent to fine column 0).
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from typing import Dict, List, Set, Tuple

Point = Tuple[int, int]  # (row, col), 0-based


@dataclass
class Cycle:
    """A Hamiltonian cycle on a cylindrical grid. ``path`` is ordered (row, col)."""

    width: int
    height: int
    path: List[Point]

    def to_dict(self) -> dict:
        return {
            "width": self.width,
            "height": self.height,
            "coords": "row,col",
            "path": [[r, c] for r, c in self.path],
        }


# ─────────────────── super-grid spanning tree ───────────────────
def _super_nbrs(node: Point, m: int, n: int, wrap: bool) -> List[Point]:
    """Neighbours of a super-grid node. Columns wrap when ``wrap``; rows never do."""
    i, j = node
    out: List[Point] = []
    if i > 0:
        out.append((i - 1, j))
    if i + 1 < m:
        out.append((i + 1, j))
    if n > 1:
        if wrap:
            out.append((i, (j - 1) % n))
            out.append((i, (j + 1) % n))
        else:
            if j > 0:
                out.append((i, j - 1))
            if j + 1 < n:
                out.append((i, j + 1))
    # de-dupe (n == 2 wrap makes left == right)
    return list(dict.fromkeys(out))


def _spanning_tree(m: int, n: int, rng: random.Random, *, wrap: bool,
                   method: str) -> List[Tuple[Point, Point]]:
    """Return the edge list of a random spanning tree over the m x n super-grid."""
    start = (rng.randrange(m), rng.randrange(n))
    visited: Set[Point] = {start}
    edges: List[Tuple[Point, Point]] = []

    if method == "backtracker":  # randomized DFS -- long, winding corridors
        stack = [start]
        while stack:
            cur = stack[-1]
            unv = [v for v in _super_nbrs(cur, m, n, wrap) if v not in visited]
            if not unv:
                stack.pop()
                continue
            nxt = rng.choice(unv)
            edges.append((cur, nxt))
            visited.add(nxt)
            stack.append(nxt)
    elif method == "prim":  # randomized Prim -- bushier, more turns
        frontier: List[Tuple[Point, Point]] = [
            (start, v) for v in _super_nbrs(start, m, n, wrap)
        ]
        while frontier:
            k = rng.randrange(len(frontier))
            a, b = frontier.pop(k)
            if b in visited:
                continue
            edges.append((a, b))
            visited.add(b)
            for v in _super_nbrs(b, m, n, wrap):
                if v not in visited:
                    frontier.append((b, v))
    else:
        raise ValueError(f"unknown tree method: {method!r}")

    if len(visited) != m * n:  # pragma: no cover - connectivity guaranteed
        raise RuntimeError("spanning tree did not cover the super-grid")
    return edges


# ─────────────────── doubling / splicing ───────────────────
def _build_cycle_adj(m: int, n: int, edges: List[Tuple[Point, Point]]
                     ) -> Dict[Point, Set[Point]]:
    """Double the super-grid into the fine cycle adjacency."""
    adj: Dict[Point, Set[Point]] = {}

    def link(a: Point, b: Point) -> None:
        adj.setdefault(a, set()).add(b)
        adj.setdefault(b, set()).add(a)

    def unlink(a: Point, b: Point) -> None:
        adj[a].discard(b)
        adj[b].discard(a)

    # 1) base 4-cycle for every super-cell
    for i in range(m):
        for j in range(n):
            r, c = 2 * i, 2 * j
            tl, tr, br, bl = (r, c), (r, c + 1), (r + 1, c + 1), (r + 1, c)
            link(tl, tr)
            link(tr, br)
            link(br, bl)
            link(bl, tl)

    # 2) splice across every tree edge
    for a, b in edges:
        (ia, ja), (ib, jb) = a, b
        if ia == ib:  # horizontal edge -> resolve left/right
            i = ia
            if abs(ja - jb) == 1:            # normal neighbours
                left_j, right_j = (ja, jb) if ja < jb else (jb, ja)
            else:                            # cylinder seam {0, n-1}
                left_j, right_j = n - 1, 0
            a_right = 2 * left_j + 1       # right fine column of the left block
            b_left = 2 * right_j           # left fine column of the right block
            rt, rb = 2 * i, 2 * i + 1
            unlink((rt, a_right), (rb, a_right))   # left block's right wall
            unlink((rt, b_left), (rb, b_left))     # right block's left wall
            link((rt, a_right), (rt, b_left))      # top connector
            link((rb, a_right), (rb, b_left))      # bottom connector
        else:  # vertical edge -> resolve top/bottom
            top, bot = (a, b) if ia < ib else (b, a)
            i, j = top
            cl, cr = 2 * j, 2 * j + 1
            ab, bt = 2 * i + 1, 2 * i + 2          # bottom row of top, top row of bottom
            unlink((ab, cl), (ab, cr))             # top block's bottom wall
            unlink((bt, cl), (bt, cr))             # bottom block's top wall
            link((ab, cl), (bt, cl))               # left connector
            link((ab, cr), (bt, cr))               # right connector

    return adj


def _order_path(adj: Dict[Point, Set[Point]], total: int) -> List[Point]:
    """Walk the cycle into an ordered list starting at (0, 0)."""
    start = (0, 0)
    path: List[Point] = []
    prev: Point | None = None
    v = start
    for _ in range(total):
        path.append(v)
        nxt = next(x for x in adj[v] if x != prev)
        prev, v = v, nxt
    return path


# ─────────────────── public API ───────────────────
def generate_cycle(width: int, height: int, *, seed: int | None = None,
                   tree: str = "prim", wrap: bool = True) -> Cycle:
    """Generate a Hamiltonian cycle on a ``width`` x ``height`` cylindrical grid.

    ``width`` and ``height`` must be even.  ``tree`` selects the spanning-tree
    sampler (``"prim"`` or ``"backtracker"``).  ``wrap`` controls whether the
    columns form a cylinder seam (True) or an open sheet (False).
    """
    if width % 2 or height % 2:
        raise ValueError("Both width and height must be even numbers")
    if width < 2 or height < 2:
        raise ValueError("width and height must be >= 2")

    m, n = height // 2, width // 2
    rng = random.Random(seed)
    edges = _spanning_tree(m, n, rng, wrap=wrap, method=tree)
    adj = _build_cycle_adj(m, n, edges)
    path = _order_path(adj, width * height)
    return Cycle(width=width, height=height, path=path)


# ─────────────────── verification ───────────────────
def verify_cycle(cycle: Cycle, *, wrap: bool = True) -> Tuple[bool, str]:
    """Check that ``cycle`` is a single valid Hamiltonian cycle on the grid."""
    W, H = cycle.width, cycle.height
    n = W * H
    path = cycle.path
    if len(path) != n:
        return False, f"path length {len(path)} != {n}"
    if len(set(path)) != n:
        return False, "path visits a cell more than once"
    if set(path) != {(r, c) for r in range(H) for c in range(W)}:
        return False, "path does not cover the whole grid"

    def adjacent(a: Point, b: Point) -> bool:
        (ra, ca), (rb, cb) = a, b
        dr = abs(ra - rb)
        dc = abs(ca - cb)
        if wrap:
            dc = min(dc, W - dc)
        return dr + dc == 1

    for a, b in zip(path, path[1:] + path[:1]):
        if not adjacent(a, b):
            return False, f"non-adjacent step {a} -> {b}"
    return True, "ok"


# ─────────────────── output ───────────────────
def save_json(cycle: Cycle, filename: str) -> None:
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(cycle.to_dict(), f, indent=2)


def _cycle_segments(cycle: Cycle, *, wrap: bool):
    """Yield drawable segments (x1, y1, x2, y2), splitting seam-crossers into stubs.

    Plot space uses x = column, y = row.
    """
    W = cycle.width
    path = cycle.path
    for a, b in zip(path, path[1:] + path[:1]):
        (ra, ca), (rb, cb) = a, b
        if wrap and ra == rb and abs(ca - cb) == W - 1:  # seam crossing
            yield (-0.5, ra, 0, ra)
            yield (W - 1, rb, W - 0.5, rb)
        else:
            yield (ca, ra, cb, rb)


def plot_cycle(cycle: Cycle, filename: str, *, wrap: bool = True,
               wall_width: float = 0.0) -> None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.collections import LineCollection
    except Exception as exc:  # pragma: no cover - matplotlib optional
        print(f"Could not import matplotlib ({exc}); skipping plot")
        return

    W, H = cycle.width, cycle.height
    segs = [((x1, y1), (x2, y2)) for x1, y1, x2, y2 in _cycle_segments(cycle, wrap=wrap)]
    lw = wall_width if wall_width > 0 else 1.2
    fig, ax = plt.subplots(figsize=(max(2, W * 0.35), max(2, H * 0.35)))
    ax.add_collection(LineCollection(segs, colors="#1a1a1a", linewidths=lw,
                                     capstyle="round", joinstyle="round"))
    ax.set_xlim(-0.7, W - 0.3)
    ax.set_ylim(-0.7, H - 0.3)
    ax.invert_yaxis()
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(f"Hamiltonian cycle — {W}×{H} cylinder", fontsize=8)
    fig.tight_layout()
    fig.savefig(filename, dpi=130, bbox_inches="tight")
    plt.close(fig)


def save_svg(cycle: Cycle, filename: str, *, wrap: bool = True,
             scale: float = 20.0, wall_width: float = 6.0,
             margin: float = 10.0) -> None:
    """Write an unrolled SVG of the cycle as a stroked path of given wall width.

    Seam-crossing edges are emitted as stubs to both edges so the printed sheet
    lines up when rolled into a cylinder.
    """
    W, H = cycle.width, cycle.height
    sw = W * scale + 2 * margin
    sh = H * scale + 2 * margin

    def X(x: float) -> float:
        return margin + (x + 0.5) * scale

    def Y(y: float) -> float:
        return margin + (y + 0.5) * scale

    lines = [
        f'<?xml version="1.0" encoding="utf-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{sw:.1f}" height="{sh:.1f}" '
        f'viewBox="0 0 {sw:.1f} {sh:.1f}">',
        f'<g fill="none" stroke="black" stroke-width="{wall_width:.2f}" '
        f'stroke-linecap="round" stroke-linejoin="round">',
    ]
    for x1, y1, x2, y2 in _cycle_segments(cycle, wrap=wrap):
        lines.append(
            f'<line x1="{X(x1):.2f}" y1="{Y(y1):.2f}" '
            f'x2="{X(x2):.2f}" y2="{Y(y2):.2f}"/>'
        )
    lines.append("</g></svg>")
    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ─────────────────── CLI ───────────────────
def main(argv: List[str] | None = None) -> None:
    ap = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        description=__doc__,
    )
    ap.add_argument("width", type=int, help="grid width / columns (even)")
    ap.add_argument("height", type=int, help="grid height / rows (even)")
    ap.add_argument("--seed", type=int, default=None, help="PRNG seed")
    ap.add_argument("--tree", choices=["prim", "backtracker"], default="prim",
                    help="spanning-tree sampler")
    ap.add_argument("--no-wrap", action="store_true",
                    help="flat sheet instead of a cylinder (no seam)")
    ap.add_argument("--json", dest="json_file", default=None, help="write cycle JSON")
    ap.add_argument("--image", dest="image_file", default=None, help="write PNG")
    ap.add_argument("--svg", dest="svg_file", default=None, help="write wall SVG")
    ap.add_argument("--wall-width", type=float, default=6.0, help="SVG wall stroke width")
    ap.add_argument("--scale", type=float, default=20.0, help="SVG units per cell")
    args = ap.parse_args(argv)

    wrap = not args.no_wrap
    cycle = generate_cycle(args.width, args.height, seed=args.seed,
                           tree=args.tree, wrap=wrap)
    ok, msg = verify_cycle(cycle, wrap=wrap)
    print(f"{args.width}x{args.height}: valid={ok} ({msg})")
    if not ok:
        sys.exit(1)
    if args.json_file:
        save_json(cycle, args.json_file)
        print(f"JSON  -> {args.json_file}")
    if args.image_file:
        plot_cycle(cycle, args.image_file, wrap=wrap)
        print(f"PNG   -> {args.image_file}")
    if args.svg_file:
        save_svg(cycle, args.svg_file, wrap=wrap,
                 scale=args.scale, wall_width=args.wall_width)
        print(f"SVG   -> {args.svg_file}")


if __name__ == "__main__":
    main()
