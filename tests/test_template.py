"""Tests for path_to_template, the printable-template pipeline stage.

Runnable under pytest or directly: ``python tests/test_template.py``.
"""
import math
import sys
import tempfile
import xml.dom.minidom as minidom
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from dual_tree_cycle import generate_cycle
from path_to_template import build_sheet, write_full_svg, write_a4_pages, A4_W, A4_H


def test_sheet_scaling():
    cyc = generate_cycle(8, 40, seed=7)
    diameter, height = 120.0, 300.0
    sheet = build_sheet(cyc, diameter_mm=diameter, height_mm=height, wall_mm=3.0)
    assert math.isclose(sheet.width_mm, math.pi * diameter, rel_tol=1e-9)
    assert math.isclose(sheet.cell_w, math.pi * diameter / 8, rel_tol=1e-9)
    assert math.isclose(sheet.cell_h, height / 40, rel_tol=1e-9)
    assert math.isclose(sheet.height_mm, height, rel_tol=1e-9)


def test_explicit_cell_dims():
    """--cell mode: cell sizes are used verbatim and imply the cylinder size."""
    cyc = generate_cycle(8, 18, seed=7)
    sheet = build_sheet(cyc, cell_w_mm=60.0, cell_h_mm=60.0, wall_mm=20.0)
    assert sheet.cell_w == 60.0 and sheet.cell_h == 60.0
    assert math.isclose(sheet.width_mm, 8 * 60.0)      # circumference 480 mm
    assert math.isclose(sheet.height_mm, 18 * 60.0)    # 1080 mm tall
    assert math.isclose(sheet.width_mm / math.pi, 152.79, abs_tol=0.1)  # ~Ø153 mm
    # partial cell spec is rejected
    for kw in ({"cell_w_mm": 60.0}, {"cell_h_mm": 60.0}):
        try:
            build_sheet(cyc, wall_mm=20.0, **kw)
        except ValueError:
            continue
        raise AssertionError("partial cell spec should raise")


def test_segments_within_bounds():
    cyc = generate_cycle(20, 20, seed=1)
    sheet = build_sheet(cyc, diameter_mm=100, height_mm=200, wall_mm=2.0)
    eps = 1e-6
    for x1, y1, x2, y2 in sheet.segments:
        for x in (x1, x2):
            assert -eps <= x <= sheet.width_mm + eps
        for y in (y1, y2):
            assert -eps <= y <= sheet.height_mm + eps
    # a cylinder must place wall stubs on both seam edges (x == 0 and x == width)
    xs = {round(x, 6) for x1, y1, x2, y2 in sheet.segments for x in (x1, x2)}
    assert 0.0 in xs
    assert round(sheet.width_mm, 6) in xs


def test_a4_page_count():
    cyc = generate_cycle(8, 40, seed=7)
    sheet = build_sheet(cyc, diameter_mm=120, height_mm=300, wall_mm=3.0)
    margin = 8.0
    uw, uh = A4_W - 2 * margin, A4_H - 2 * margin
    expect = max(1, math.ceil(sheet.width_mm / uw)) * max(1, math.ceil(sheet.height_mm / uh))
    with tempfile.TemporaryDirectory() as d:
        files = write_a4_pages(sheet, str(Path(d) / "t"), margin=margin)
        assert len(files) == expect
        for fn in files:
            minidom.parse(fn)  # well-formed XML


def test_full_svg_wellformed_and_has_seam_marker():
    cyc = generate_cycle(12, 12, seed=2)
    sheet = build_sheet(cyc, diameter_mm=90, height_mm=120, wall_mm=2.5)
    with tempfile.TemporaryDirectory() as d:
        fn = str(Path(d) / "full.svg")
        write_full_svg(sheet, fn)
        doc = minidom.parse(fn)  # well-formed
        assert "glue seam" in doc.toxml()


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"\nAll {len(fns)} tests passed.")
