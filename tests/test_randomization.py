import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from cycle_generator import generate_cycle, _is_neighbor


def is_cycle_valid(cycle):
    path = cycle.path
    width = cycle.width
    height = cycle.height
    if len(path) != width * height:
        return False
    if len(set(path)) != len(path):
        return False
    return all(
        _is_neighbor(path[i], path[(i + 1) % len(path)], width)
        for i in range(len(path))
    )


def test_random_cycle_valid_and_reproducible():
    base = generate_cycle(4, 4, flips=0, progress=False)
    rnd1 = generate_cycle(4, 4, flips=20, seed=123, progress=False)
    rnd2 = generate_cycle(4, 4, flips=20, seed=123, progress=False)
    rnd3 = generate_cycle(4, 4, flips=20, seed=456, progress=False)

    assert is_cycle_valid(rnd1)
    assert rnd1.path == rnd2.path
    assert rnd1.path != base.path
    assert rnd1.path != rnd3.path
