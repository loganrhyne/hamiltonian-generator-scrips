"""Tests for the woven-strip chart generator.

Runnable under pytest or directly: ``python tests/test_weave_chart.py``.
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from dual_tree_cycle import generate_cycle
from weave_chart import DARK, LIGHT, main, max_floats, path_gates, solve, visible


def _cycles(max_side=16):
    for W in range(2, max_side + 1, 2):
        for H in range(2, max_side + 1, 2):
            for tree in ("prim", "backtracker"):
                yield generate_cycle(W, H, seed=W * 31 + H, tree=tree, wrap=False)


def test_weave_shows_target_image():
    """Every crossing shows the colour the path drawing asks for."""
    for scheme in ("solid", "checker"):
        for k in (3, 5):
            for cyc in _cycles(10):
                w = solve(cyc, k=k, scheme=scheme)
                for r in range(w.rows):
                    for c in range(w.cols):
                        assert visible(w, r, c) == w.image[r][c], (scheme, k, r, c)


def test_floats_at_most_three_for_k3():
    for scheme in ("solid", "checker"):
        for cyc in _cycles():
            w = solve(cyc, k=3, scheme=scheme)
            assert max(max_floats(w)) <= 3, (scheme, cyc.width, cyc.height, max_floats(w))


def test_each_cell_shows_exactly_its_two_gates():
    for cyc in _cycles(8):
        w = solve(cyc, k=3, scheme="solid")
        for (r, c), sides in path_gates(cyc).items():
            r0, c0 = 3 * r + 1, 3 * c + 1
            arms = {"N": (r0 - 1, c0), "S": (r0 + 1, c0), "W": (r0, c0 - 1), "E": (r0, c0 + 1)}
            dark = {s for s, (y, x) in arms.items() if w.image[y][x] == DARK}
            assert dark == sides and len(sides) == 2
            assert w.image[r0][c0] == DARK
            for y, x in ((r0 - 1, c0 - 1), (r0 - 1, c0 + 1), (r0 + 1, c0 - 1), (r0 + 1, c0 + 1)):
                assert w.image[y][x] == LIGHT


def test_scheme_strip_colours():
    cyc = generate_cycle(6, 4, seed=1, wrap=False)
    solid = solve(cyc, scheme="solid")
    assert [solid.warp[0][c] for c in range(6)] == [LIGHT, DARK, LIGHT] * 2
    checker = solve(cyc, scheme="checker")
    for r in range(checker.rows):
        for c in range(checker.cols):
            assert checker.warp[r][c] != checker.weft[r][c]
            assert not checker.free[r][c]


def test_odd_k_required():
    cyc = generate_cycle(4, 4, seed=0, wrap=False)
    for bad in (1, 2, 4):
        try:
            solve(cyc, k=bad)
        except ValueError:
            continue
        raise AssertionError(f"k={bad} accepted")


def test_cli_writes_outputs():
    with tempfile.TemporaryDirectory() as d:
        base = os.path.join(d, "piece")
        main(["--size", "6", "4", "--seed", "3", "--scheme", "checker", "--out", base])
        for suffix in ("_chart.svg", "_proof.svg", "_rows.txt"):
            assert os.path.getsize(base + suffix) > 0
        rows = [l for l in open(base + "_rows.txt") if l.startswith("row ")]
        assert len(rows) == 12
        for line in rows:
            runs = line.split()[2:]
            assert sum(int(t[1:]) for t in runs) == 18


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
