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
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

Point = Tuple[int, int]


@dataclass
class Cycle:
    """Representation of a Hamiltonian cycle on a cylindrical grid."""

    width: int
    height: int
    path: List[Point]

    def to_dict(self) -> dict:
        return {"width": self.width, "height": self.height, "path": self.path}

def _path_to_adj(path: List[Point]) -> Dict[Point, List[Point]]:
    """Convert a cyclic path into an adjacency mapping."""
    adj: Dict[Point, List[Point]] = {p: [] for p in path}
    for a, b in zip(path, path[1:]):
        adj[a].append(b)
        adj[b].append(a)
    # close cycle
    adj[path[0]].append(path[-1])
    adj[path[-1]].append(path[0])
    return adj


def _adj_to_path(adj: Dict[Point, List[Point]], start: Point) -> List[Point]:
    """Reconstruct an ordered cycle path from an adjacency map."""
    path = [start]
    prev: Point | None = None
    current = start
    while True:
        nbrs = adj[current]
        nxt = nbrs[0] if nbrs[0] != prev else nbrs[1]
        if nxt == start:
            break
        path.append(nxt)
        prev, current = current, nxt
    return path


def _random_flips(adj: Dict[Point, List[Point]], width: int, height: int, flips: int, rng: random.Random,
                  progress: bool = True, verbose: bool = False) -> None:
    """Perform random 2x2 square edge flips to randomise the cycle."""
    performed_total = 0

    for i in range(flips):
        x = rng.randrange(width)
        y = rng.randrange(height - 1)
        x1 = (x + 1) % width
        y1 = y + 1
        v0, v1 = (x, y), (x1, y)
        v2, v3 = (x, y1), (x1, y1)

        performed = False
        if v1 in adj[v0] and v3 in adj[v2] and v2 not in adj[v0] and v3 not in adj[v1]:
            edges_remove = [(v0, v1), (v2, v3)]
            edges_add = [(v0, v2), (v1, v3)]
        elif v2 in adj[v0] and v3 in adj[v1] and v1 not in adj[v0] and v3 not in adj[v2]:
            edges_remove = [(v0, v2), (v1, v3)]
            edges_add = [(v0, v1), (v2, v3)]
        else:
            edges_remove = edges_add = []

        if edges_remove:
            for a, b in edges_remove:
                adj[a].remove(b); adj[b].remove(a)
            for a, b in edges_add:
                adj[a].append(b); adj[b].append(a)
            if len(_adj_to_path(adj, v0)) == width * height:
                performed = True
                performed_total += 1
            else:  # revert split cycles
                for a, b in edges_add:
                    adj[a].remove(b); adj[b].remove(a)
                for a, b in edges_remove:
                    adj[a].append(b); adj[b].append(a)

        if verbose:
            status = "succeeded" if performed else "failed"
            print(f"Flip {i + 1} at ({x},{y}) {status}")

        if progress:
            msg = f"Flipping: {i + 1}/{flips}"
            if performed_total:
                msg += f" ({performed_total} succeeded)"
            if verbose:
                print(msg)
            else:
                print("\r" + msg, end="")

    if flips:
        if progress and not verbose:
            print()
        if progress or verbose:
            print(f"Flips performed: {performed_total}/{flips}")


def generate_cycle(width: int, height: int, *, flips: int = 0, seed: int | None = None,
                   progress: bool = True, verbose: bool = False) -> Cycle:

    """Generate a Hamiltonian cycle for an even grid on a cylinder.

    The base algorithm snakes vertically through each column and relies on the
    horizontal wrap between the first and last columns to close the cycle.
    Optional random "flips" are applied to produce a less regular cycle.

    """
    if width % 2 or height % 2:
        raise ValueError("Both width and height must be even numbers")

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

    if flips:
        adj = _path_to_adj(path)
        rng = random.Random(seed)
        _random_flips(adj, width, height, flips, rng, progress, verbose)

        path = _adj_to_path(adj, path[0])

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
