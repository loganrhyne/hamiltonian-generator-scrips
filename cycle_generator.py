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
from dataclasses import dataclass
from typing import Callable, Iterable, List, Tuple

Point = Tuple[int, int]


@dataclass
class Cycle:
    """Representation of a Hamiltonian cycle on a cylindrical grid."""

    width: int
    height: int
    path: List[Point]

    def to_dict(self) -> dict:
        return {"width": self.width, "height": self.height, "path": self.path}


def generate_cycle(width: int, height: int, progress: bool = True) -> Cycle:
    """Generate a Hamiltonian cycle for an even grid on a cylinder.

    The algorithm snakes vertically through each column and relies on the
    horizontal wrap between the first and last columns to close the cycle.
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

    xs = [x for x, _ in cycle.path] + [cycle.path[0][0]]
    ys = [y for _, y in cycle.path] + [cycle.path[0][1]]

    plt.figure(figsize=(cycle.width / 2, cycle.height / 2))
    plt.plot(xs, ys, "-o", markersize=3)
    plt.xlim(-0.5, cycle.width - 0.5)
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
    args = parser.parse_args()

    cycle = generate_cycle(args.width, args.height)
    save_cycle_json(cycle, args.json_file)
    plot_cycle(cycle, args.image_file)


if __name__ == "__main__":
    main()
