#!/usr/bin/env python3
"""Generate Hamiltonian cycles on cylindrical grids.

This script produces a Hamiltonian cycle for an even width/height grid that
wraps horizontally to form a cylinder. Progress is printed to the terminal
while the path is generated. The resulting cycle can be saved to JSON and
optionally visualised using matplotlib if it is installed.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from dataclasses import dataclass
from typing import Iterable, List, Tuple

Point = Tuple[int, int]


@dataclass
class Cycle:
    """Representation of a Hamiltonian cycle on a cylindrical grid."""

    width: int
    height: int
    path: List[Point]

    def to_dict(self) -> dict:
        return {"width": self.width, "height": self.height, "path": self.path}


def _is_neighbor(a: Point, b: Point, width: int) -> bool:
    """Return True if two points are adjacent on the cylindrical grid."""
    dx = abs(a[0] - b[0])
    dx = min(dx, width - dx)  # wrap horizontally
    dy = abs(a[1] - b[1])
    return dx + dy == 1


def _random_rotate(path: List[Point], rng: random.Random) -> None:
    """Apply a random rotation and optional reversal to the path."""
    n = len(path)
    offset = rng.randrange(n)
    path[:] = path[offset:] + path[:offset]
    if rng.choice([True, False]):
        path.reverse()


def _serpentine_cycle(width: int, height: int, *, progress: bool) -> List[Point]:
    """Return the original deterministic serpentine cycle."""
    path: List[Point] = []
    total = width * height
    count = 0
    for x in range(width):
        ys: Iterable[int] = range(height) if x % 2 == 0 else reversed(range(height))
        for y in ys:
            path.append((x, y))
            count += 1
            if progress:
                print(f"\rGenerating: {count}/{total}", end="")
    if progress:
        print()
    return path


def _neighbors(point: Point, width: int, height: int) -> List[Point]:
    """Return the valid neighbours of a point on the cylindrical grid."""
    x, y = point
    opts = [((x + 1) % width, y), ((x - 1) % width, y)]
    if y + 1 < height:
        opts.append((x, y + 1))
    if y - 1 >= 0:
        opts.append((x, y - 1))
    return opts


def _random_cycle(width: int, height: int, rng: random.Random, *, progress: bool) -> List[Point]:
    """Construct a Hamiltonian cycle using a randomized depth-first search.

    A Warnsdorff-style heuristic (preferring moves that leave few options) keeps
    the search tractable even for fairly large grids.  The RNG controls the
    tie-breaking order, so runs with the same seed are reproducible.
    """

    sys.setrecursionlimit(max(sys.getrecursionlimit(), width * height + 10))
    total = width * height
    start: Point = (0, 0)
    path: List[Point] = [start]
    visited = {start}

    if progress:
        print(f"\rGenerating: 1/{total}", end="")

    def dfs(p: Point) -> bool:
        if len(path) == total:
            return _is_neighbor(path[-1], start, width)

        nbrs = [n for n in _neighbors(p, width, height) if n not in visited]
        rng.shuffle(nbrs)
        nbrs.sort(key=lambda n: sum(nn not in visited for nn in _neighbors(n, width, height)))
        for n in nbrs:
            path.append(n)
            visited.add(n)
            if progress:
                print(f"\rGenerating: {len(path)}/{total}", end="")
            if dfs(n):
                return True
            path.pop()
            visited.remove(n)
            if progress:
                # show backtracking progress so the user knows the search
                # is still active even when the path shrinks
                print(f"\rGenerating: {len(path)}/{total}", end="")
        return False

    if not dfs(start):  # pragma: no cover - extremely unlikely for even grids
        raise RuntimeError("Failed to generate Hamiltonian cycle")

    if progress:
        print()
    return path


def generate_cycle(width: int, height: int, *, flips: int = 0, seed: int | None = None,
                   progress: bool = True, verbose: bool = False) -> Cycle:

    """Generate a Hamiltonian cycle for an even grid on a cylinder.

    With ``flips=0`` the original deterministic serpentine cycle is produced.
    Any positive ``flips`` value triggers a randomized depth‑first search to
    introduce randomness.  The ``seed`` parameter controls the RNG so runs are
    reproducible.
    """

    if width % 2 or height % 2:
        raise ValueError("Both width and height must be even numbers")

    if flips <= 0:
        path = _serpentine_cycle(width, height, progress=progress)
    else:
        rng = random.Random(seed)
        path = _random_cycle(width, height, rng, progress=progress)
        _random_rotate(path, rng)

    return Cycle(width=width, height=height, path=path)


def save_cycle_json(cycle: Cycle, filename: str) -> None:
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(cycle.to_dict(), f, indent=2)
    print(f"Cycle saved to {filename}")


def plot_cycle(cycle: Cycle, filename: str) -> None:
    try:
        import matplotlib.pyplot as plt
    except Exception as exc:  # pragma: no cover - matplotlib is optional
        print(f"Could not import matplotlib ({exc}); skipping plot")
        return

    plt.figure(figsize=(cycle.width / 2, cycle.height / 2))
    edge_left = -0.5
    edge_right = cycle.width - 0.5
    for (x1, y1), (x2, y2) in zip(cycle.path, cycle.path[1:] + [cycle.path[0]]):
        dx = x2 - x1
        if dx == cycle.width - 1:  # wrap west across seam
            plt.plot([x1, edge_left], [y1, y1], color="C0")
            plt.plot([edge_right, x2], [y2, y2], color="C0")
        elif dx == -(cycle.width - 1):  # wrap east across seam
            plt.plot([x1, edge_right], [y1, y1], color="C0")
            plt.plot([edge_left, x2], [y2, y2], color="C0")
        else:
            plt.plot([x1, x2], [y1, y2], color="C0")
    xs = [x for x, _ in cycle.path]
    ys = [y for _, y in cycle.path]
    plt.scatter(xs, ys, s=9, color="C0")
    plt.xlim(edge_left, edge_right)
    plt.ylim(-0.5, cycle.height - 0.5)
    plt.gca().invert_yaxis()
    plt.gca().set_aspect("equal", adjustable="box")
    plt.grid(True, linewidth=0.5)
    plt.title(f"Hamiltonian cycle on {cycle.width}x{cycle.height} cylindrical grid")
    plt.savefig(filename)
    plt.close()
    print(f"Plot saved to {filename}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("width", type=int, help="grid width (even)")
    parser.add_argument("height", type=int, help="grid height (even)")
    parser.add_argument("--json", dest="json_file", default="cycle.json", help="output JSON file")
    parser.add_argument("--image", dest="image_file", default="cycle.png", help="output image file")
    parser.add_argument("--flips", type=int, default=0, help="random square flips to apply")
    parser.add_argument("--seed", type=int, default=None, help="random seed for flips")
    parser.add_argument("--verbose", action="store_true", help="log each attempted flip")
    args = parser.parse_args()

    cycle = generate_cycle(args.width, args.height, flips=args.flips, seed=args.seed,
                           verbose=args.verbose)
    save_cycle_json(cycle, args.json_file)
    plot_cycle(cycle, args.image_file)


if __name__ == "__main__":
    main()
