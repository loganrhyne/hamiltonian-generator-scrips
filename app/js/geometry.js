// Physical geometry + print layout for cylindrical Hamiltonian-cycle lamps.
//
// Everything here is pure data-in/data-out (no DOM, no PDF library) so it can
// be exercised in Node. Units are mm throughout. The unrolled sheet uses
// x = circumference (columns), y = height (rows), origin at the top-left,
// matching path_to_template.py.

import { cycleSegments, cycleSteps } from './cycle.js';

export const A4 = { w: 210, h: 297 }; // mm, portrait

// ─────────────────── unrolled sheet ───────────────────
/**
 * Scale a cycle to a real cylinder: columns -> circumference, rows -> height.
 * Seam-crossing edges become half-cell stubs on both vertical edges, so the
 * path stays continuous when the sheet is rolled and the edges are glued.
 */
export function buildSheet(cycle, { cellW, cellH, wrap = true } = {}) {
  const { width: W, height: H } = cycle;
  const segments = cycleSegments(cycle, { wrap }).map((s) => ({
    x1: (s.x1 + 0.5) * cellW,
    y1: (s.y1 + 0.5) * cellH,
    x2: (s.x2 + 0.5) * cellW,
    y2: (s.y2 + 0.5) * cellH,
  }));
  return {
    widthMM: W * cellW,
    heightMM: H * cellH,
    cellW,
    cellH,
    segments,
  };
}

/** Headline numbers for a configuration. */
export function computeStats({ cols, rows, cellW, cellH, wallHeight }) {
  const circumference = cols * cellW;
  const nH = cols * rows; // horizontal steps (one per cell, h+v split below)
  return {
    cols,
    rows,
    cells: cols * rows,
    cellW,
    cellH,
    wallHeight,
    circumference,
    diameter: circumference / Math.PI,
    heightMM: rows * cellH,
    // exact ribbon length needs the cycle's h/v split; see buildStrips
    maxRibbonLength: nH * Math.max(cellW, cellH),
  };
}

// ─────────────────── wall ribbon -> A4 strips ───────────────────
/**
 * Turn the cycle into a continuous wall ribbon and pack it into printable
 * strips. The ribbon is `wallHeight` tall and runs the whole cycle; each 90°
 * turn in the path becomes a vertical fold line. Strips are cut from A4
 * landscape rows and joined end-to-end with overlap glue tabs; cuts are
 * placed mid-segment (as far from the neighbouring folds as possible).
 *
 * Returns:
 *   strips: [{index, length, folds: [{pos, turn}]}]   pos in mm from strip start
 *   totalLength: ribbon length in mm (excluding tabs)
 *   pages: [{strips: [stripIndex...]}] layout rows on landscape A4
 */
export function buildStrips(cycle, {
  cellW, cellH, wallHeight,
  margin = 8, tab = 12, gap = 6, wrap = true,
} = {}) {
  const steps = cycleSteps(cycle, { wrap });
  const n = steps.length;

  // fold positions along the ribbon: after step k if the path turns L/R
  const folds = []; // {pos, turn, stepIndex}
  let total = 0;
  for (let k = 0; k < n; k++) {
    total += steps[k].dir === 'h' ? cellW : cellH;
    if (steps[k].turn !== 'S' && k < n - 1) {
      folds.push({ pos: total, turn: steps[k].turn, stepIndex: k });
    }
  }
  // The wrap-around joint (end of step n-1 back to start) is a strip joint,
  // not a fold — the loop closes by gluing the last tab to strip 1's start.
  const closingTurn = steps[n - 1].turn;

  // strips run along the long edge of a landscape A4 page
  const pageLength = Math.max(A4.w, A4.h) - 2 * margin;
  const stripCapacity = pageLength - tab; // printed content per strip
  if (stripCapacity <= 0) throw new Error('margin/tab leave no usable strip length');

  // pack: walk the ribbon, cutting strips of content <= stripCapacity with
  // each cut placed mid-segment between folds
  const strips = [];
  let start = 0; // ribbon position where current strip starts
  let fi = 0; // first fold index not yet assigned
  while (start < total - 1e-9) {
    const capEnd = start + stripCapacity;
    let end;
    if (capEnd >= total) {
      end = total;
    } else {
      // last fold at or before capEnd, and the next one after it
      let lo = fi;
      while (lo < folds.length && folds[lo].pos <= capEnd + 1e-9) lo++;
      const prevFold = lo > fi ? folds[lo - 1].pos : start;
      const nextFold = lo < folds.length ? folds[lo].pos : total;
      end = Math.min(capEnd, (prevFold + nextFold) / 2);
      // folds are at least one cell apart, so a mid-gap cut always clears
      // both folds by `clearance` — but a capacity-limited cut can hug the
      // fold before it; back off to the middle of the previous gap instead
      const clearance = Math.min(2, Math.min(cellW, cellH) / 2);
      if (lo > fi && end - prevFold < clearance) {
        const before = lo - 1 > fi ? folds[lo - 2].pos : start;
        end = (before + prevFold) / 2;
      }
      if (end <= start + 1e-9) {
        // a single segment longer than the strip: hard cut at capacity
        end = capEnd;
      }
    }
    const stripFolds = [];
    while (fi < folds.length && folds[fi].pos < end - 1e-9) {
      stripFolds.push({ pos: folds[fi].pos - start, turn: folds[fi].turn });
      fi++;
    }
    strips.push({ index: strips.length + 1, length: end - start, folds: stripFolds });
    start = end;
  }

  // layout: strips stack as rows on landscape A4
  const pageHeight = Math.min(A4.w, A4.h) - 2 * margin;
  const perPage = Math.max(1, Math.floor((pageHeight + gap) / (wallHeight + gap)));
  const pages = [];
  for (let i = 0; i < strips.length; i += perPage) {
    pages.push({ strips: strips.slice(i, i + perPage).map((s) => s.index) });
  }

  return {
    strips,
    totalLength: total,
    foldCount: folds.length,
    closingTurn,
    wallHeight,
    tab,
    margin,
    gap,
    pageLength,
    stripCapacity,
    perPage,
    pages,
  };
}

// ─────────────────── unrolled sheet -> A4 tiles ───────────────────
function clipSegment(s, x0, y0, x1, y1) {
  // axis-aligned segments only: clip to rect, return null if outside
  let { x1: ax, y1: ay, x2: bx, y2: by } = s;
  if (ax > bx) [ax, bx] = [bx, ax];
  if (ay > by) [ay, by] = [by, ay];
  const cx0 = Math.max(ax, x0);
  const cy0 = Math.max(ay, y0);
  const cx1 = Math.min(bx, x1);
  const cy1 = Math.min(by, y1);
  if (cx0 > cx1 || cy0 > cy1) return null;
  return { x1: cx0, y1: cy0, x2: cx1, y2: cy1 };
}

/**
 * Tile the unrolled sheet onto A4 portrait pages (matching write_a4_pages in
 * path_to_template.py). Each page shows a (usableW x usableH) window of the
 * sheet, with crop marks at the window corners, the glue-seam edges marked in
 * the page, and a R#C# label. Segments are pre-clipped to the window and
 * given in page-local mm (origin at the paper's top-left corner).
 */
export function buildTiles(sheet, { margin = 8 } = {}) {
  const usableW = A4.w - 2 * margin;
  const usableH = A4.h - 2 * margin;
  const ncol = Math.max(1, Math.ceil(sheet.widthMM / usableW));
  const nrow = Math.max(1, Math.ceil(sheet.heightMM / usableH));
  const pages = [];
  for (let r = 0; r < nrow; r++) {
    for (let c = 0; c < ncol; c++) {
      const ox = c * usableW; // sheet-space origin of this tile's window
      const oy = r * usableH;
      const segments = [];
      for (const s of sheet.segments) {
        const cs = clipSegment(s, ox, oy, ox + usableW, oy + usableH);
        if (cs) {
          segments.push({
            x1: cs.x1 - ox + margin,
            y1: cs.y1 - oy + margin,
            x2: cs.x2 - ox + margin,
            y2: cs.y2 - oy + margin,
          });
        }
      }
      // glue-seam edges (sheet x = 0 and x = widthMM) visible in this window
      const seams = [];
      for (const ex of [0, sheet.widthMM]) {
        if (ex >= ox - 1e-9 && ex <= ox + usableW + 1e-9) {
          seams.push({ x: ex - ox + margin });
        }
      }
      pages.push({
        row: r + 1,
        col: c + 1,
        label: `R${r + 1}C${c + 1}`,
        ox,
        oy,
        segments,
        seams,
      });
    }
  }
  return { pages, nrow, ncol, margin, usableW, usableH };
}

// ─────────────────── 3D wall geometry ───────────────────
/**
 * Build the wall ribbon as triangle mesh data on the cylinder, extruded
 * radially inward by `wallHeight`. Returns plain typed arrays (consumable by
 * three.js BufferGeometry, testable in Node).
 *
 * Cylinder axis = y (up). Column c sits at angle 2π * (c + 0.5) / W; row r at
 * height (H - r - 0.5) * cellH (row 0 at the top, like the sheet).
 */
export function buildWallMesh(cycle, {
  cellW, cellH, wallHeight, wrap = true, arcSegments = 4,
} = {}) {
  const { width: W, height: H, path } = cycle;
  const R = (W * cellW) / (2 * Math.PI);
  const Ri = Math.max(R - wallHeight, R * 0.02);
  const positions = [];
  const indices = [];

  const angle = (c) => (2 * Math.PI * (c + 0.5)) / W;
  const yOf = (r) => (H - r - 0.5) * cellH;

  function addRibbon(points) {
    // points: [{a, y}] along the surface; emit quads between outer and inner
    const base = positions.length / 3;
    for (const p of points) {
      const ca = Math.cos(p.a);
      const sa = Math.sin(p.a);
      positions.push(R * ca, p.y, R * sa);
      positions.push(Ri * ca, p.y, Ri * sa);
    }
    for (let i = 0; i + 1 < points.length; i++) {
      const o = base + 2 * i;
      indices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  }

  const n = path.length;
  for (let k = 0; k < n; k++) {
    const a = path[k];
    const b = path[(k + 1) % n];
    const ra = Math.floor(a / W);
    const ca = a % W;
    const rb = Math.floor(b / W);
    const cb = b % W;
    if (ra === rb) {
      // horizontal: arc between the two column angles (short way, may wrap)
      let a0 = angle(ca);
      let a1 = angle(cb);
      let d = a1 - a0;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      if (!wrap && Math.abs(ca - cb) === W - 1) continue; // open sheet: skip seam edge
      const pts = [];
      for (let i = 0; i <= arcSegments; i++) {
        pts.push({ a: a0 + (d * i) / arcSegments, y: yOf(ra) });
      }
      addRibbon(pts);
    } else {
      // vertical: straight ribbon at one angle
      addRibbon([
        { a: angle(ca), y: yOf(ra) },
        { a: angle(ca), y: yOf(rb) },
      ]);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    radius: R,
    innerRadius: Ri,
    heightMM: H * cellH,
  };
}
