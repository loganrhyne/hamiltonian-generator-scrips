"""Tests for the dual-tree (spanning-tree doubling) Hamiltonian cycle generator.

Runnable under pytest or directly: ``python tests/test_dual_tree.py``.
"""
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from dual_tree_cycle import generate_cycle, verify_cycle


def _all_even(lo, hi, step=2):
    return range(lo, hi + 1, step)


def test_valid_across_sizes():
    """Every even W,H up to 40 yields a single valid Hamiltonian cycle."""
    for tree in ("prim", "backtracker"):
        for wrap in (True, False):
            for W in _all_even(2, 40):
                for H in _all_even(2, 40):
                    cyc = generate_cycle(W, H, seed=W * 100 + H, tree=tree, wrap=wrap)
                    ok, msg = verify_cycle(cyc, wrap=wrap)
                    assert ok, f"{W}x{H} tree={tree} wrap={wrap}: {msg}"


def test_target_100x100():
    """The design target: 100x100 cylinders are valid for many seeds."""
    for seed in range(20):
        tree = "prim" if seed % 2 else "backtracker"
        cyc = generate_cycle(100, 100, seed=seed, tree=tree, wrap=True)
        ok, msg = verify_cycle(cyc, wrap=True)
        assert ok, f"100x100 seed={seed}: {msg}"


def test_odd_dimensions_rejected():
    for bad in [(3, 4), (4, 5), (5, 5), (7, 8)]:
        try:
            generate_cycle(*bad)
        except ValueError:
            continue
        raise AssertionError(f"{bad} should have raised ValueError")


def test_determinism():
    a = generate_cycle(40, 40, seed=42)
    b = generate_cycle(40, 40, seed=42)
    c = generate_cycle(40, 40, seed=43)
    assert a.path == b.path
    assert a.path != c.path


def test_cylinder_crosses_seam():
    """A wrapped cylinder should use the seam (col W-1 adjacent to col 0)."""
    W, H = 20, 20
    cyc = generate_cycle(W, H, seed=3, wrap=True)
    seam = sum(
        1
        for a, b in zip(cyc.path, cyc.path[1:] + cyc.path[:1])
        if a[0] == b[0] and abs(a[1] - b[1]) == W - 1
    )
    assert seam > 0


def test_flat_has_no_seam():
    """A non-wrapped sheet must never use a seam edge."""
    W, H = 20, 20
    cyc = generate_cycle(W, H, seed=3, wrap=False)
    seam = sum(
        1
        for a, b in zip(cyc.path, cyc.path[1:] + cyc.path[:1])
        if a[0] == b[0] and abs(a[1] - b[1]) == W - 1
    )
    assert seam == 0


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"\nAll {len(fns)} tests passed.")
