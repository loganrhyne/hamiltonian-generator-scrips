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
  return {
    cols,
    rows,
    cells: cols * rows,
    cellW,
    cellH,
    wallHeight,
    circumference,
    diameter: circumference / Math.PI,
    radius: circumference / (2 * Math.PI),
    heightMM: rows * cellH,
  };
}

// ─────────────────── wall ribbon -> printable pieces ───────────────────
// The wall stands on the shade surface and extrudes radially inward, so its
// developable (flattened) shape is NOT a straight strip:
//   * a vertical path run lies in an axial plane  -> flat rectangle;
//   * a horizontal path run lies in a horizontal plane -> annular sector with
//     outer radius R (the cylinder radius, where it meets the shade) and
//     inner radius R - wallHeight; each horizontal cell spans 2π/W radians.
// Chained pieces stay connected through 90° folds at every h↔v junction (the
// fold line is radial, so travel continues straight across it when flat) and
// every arc bends toward the free edge, so chains curl predictably. A piece
// is cut whenever adding the next cell would overflow the printable A4 area
// or accumulate ≥ maxTurn of arc curvature (self-overlap guard).
//
// Piece-local coordinates: the outer (shade) edge starts at (0,0) heading +x,
// and the band extends `wallHeight` to the left of travel (+y on the page).
/**
 * Returns {pieces, placements, pageCount, totalOuterLength, foldsPrinted,
 * joints, R, thetaC, usableW, usableH, ...}. Each piece:
 *   {index, elements, folds, end, bbox, outerLen}
 *   elements: [{kind:'straight', p0, p1, ang} | {kind:'arc', C, phi0, phi1}]
 *   folds:    [{p, ang, turn}] — fold line runs from p across the band
 *   end:      {p, ang, joinFold} — where the glue tab goes; joinFold is the
 *             L/R turn consumed by this joint (null for a mid-run cut)
 * placements: [{page, piece, x, y}] with (x, y) inside the usable area.
 */
export function buildPieces(cycle, {
  cellW, cellH, wallHeight,
  margin = 8, tab = 12, gap = 6,
  maxTurn = 1.5 * Math.PI, maxBand = null, wrap = true,
} = {}) {
  const { width: W } = cycle;
  const steps = cycleSteps(cycle, { wrap });
  const n = steps.length;
  const R = (W * cellW) / (2 * Math.PI);
  const w = wallHeight;
  if (w >= R) {
    throw new Error(`wall height ${w} mm must be below the cylinder radius ${R.toFixed(1)} mm`);
  }

  const usableW = Math.max(A4.w, A4.h) - 2 * margin; // landscape page
  const usableH = Math.min(A4.w, A4.h) - 2 * margin;
  const thetaC = (2 * Math.PI) / W; // arc angle of one horizontal cell
  // pieces are rotated to their start->end chord before placement, so the
  // packing-friendly constraint is a cap on the rotated band height: slim
  // pieces shelf-pack densely instead of one snake hogging a whole page
  const bandCap = Math.min(usableH, maxBand ?? Math.max(3 * w, 45));

  const leftOf = (a) => [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2)];

  // chain state for the piece under construction
  let P, ang, elements, folds, pts, turnAcc, outerLen;
  function resetPiece() {
    P = [0, 0];
    ang = 0;
    elements = [];
    folds = [];
    pts = [[0, 0], [0, w]];
    turnAcc = 0;
    outerLen = 0;
  }

  function tabPoints(p, a) {
    const d = [Math.cos(a), Math.sin(a)];
    const nl = leftOf(a);
    return [
      [p[0], p[1]],
      [p[0] + w * nl[0], p[1] + w * nl[1]],
      [p[0] + w * nl[0] + tab * d[0], p[1] + w * nl[1] + tab * d[1]],
      [p[0] + tab * d[0], p[1] + tab * d[1]],
    ];
  }

  function bboxOf(points) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const [x, y] of points) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  // bbox of `points` after rotating the chord (origin -> endP) onto +x
  function chordBBox(points, endP) {
    const a = Math.hypot(endP[0], endP[1]) > 1e-9 ? Math.atan2(endP[1], endP[0]) : 0;
    const ca = Math.cos(-a);
    const sa = Math.sin(-a);
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const [x, y] of points) {
      const rx = x * ca - y * sa;
      const ry = x * sa + y * ca;
      if (rx < x0) x0 = rx;
      if (ry < y0) y0 = ry;
      if (rx > x1) x1 = rx;
      if (ry > y1) y1 = ry;
    }
    return { angle: a, x0, y0, w: x1 - x0, h: y1 - y0 };
  }

  // geometry of extending the chain by one cell (not yet applied)
  function stepGeom(dir) {
    if (dir === 'v') {
      const d = [Math.cos(ang), Math.sin(ang)];
      const nl = leftOf(ang);
      const p1 = [P[0] + cellH * d[0], P[1] + cellH * d[1]];
      return {
        kind: 'straight',
        p1,
        ang1: ang,
        newPts: [p1, [p1[0] + w * nl[0], p1[1] + w * nl[1]]],
        len: cellH,
        turn: 0,
      };
    }
    // horizontal cell: arc with the centre on the free-edge side of travel
    const nl = leftOf(ang);
    const C = [P[0] + R * nl[0], P[1] + R * nl[1]];
    const phi0 = Math.atan2(P[1] - C[1], P[0] - C[0]);
    const phi1 = phi0 + thetaC;
    const p1 = [C[0] + R * Math.cos(phi1), C[1] + R * Math.sin(phi1)];
    const m = Math.max(2, Math.ceil(thetaC / (Math.PI / 30))); // ≤6° samples
    const newPts = [];
    for (let i = 1; i <= m; i++) {
      const ph = phi0 + (thetaC * i) / m;
      newPts.push([C[0] + R * Math.cos(ph), C[1] + R * Math.sin(ph)]);
      newPts.push([C[0] + (R - w) * Math.cos(ph), C[1] + (R - w) * Math.sin(ph)]);
    }
    return { kind: 'arc', C, r: R, phi0, phi1, p1, ang1: ang + thetaC, newPts, len: cellW, turn: thetaC };
  }

  function applyStep(g) {
    const last = elements[elements.length - 1];
    if (g.kind === 'straight') {
      if (last && last.kind === 'straight' && Math.abs(last.ang - ang) < 1e-12) {
        last.p1 = g.p1; // extend the run
      } else {
        elements.push({ kind: 'straight', p0: [...P], p1: g.p1, ang });
      }
    } else if (last && last.kind === 'arc' && Math.abs(last.phi1 - g.phi0) < 1e-9
               && Math.hypot(last.C[0] - g.C[0], last.C[1] - g.C[1]) < 1e-6) {
      last.phi1 = g.phi1;
    } else {
      elements.push({ kind: 'arc', C: g.C, r: g.r, phi0: g.phi0, phi1: g.phi1 });
    }
    pts.push(...g.newPts);
    P = g.p1;
    ang = g.ang1;
    turnAcc += g.turn;
    outerLen += g.len;
  }

  const pieces = [];
  function finalizePiece(joinFold) {
    // rotate the piece so its start->end chord runs along +x (slimmest
    // practical orientation for packing), then shift into its bbox
    const bb = chordBBox(pts.concat(tabPoints(P, ang)), P);
    const ca = Math.cos(-bb.angle);
    const sa = Math.sin(-bb.angle);
    const xf = ([x, y]) => [x * ca - y * sa - bb.x0, x * sa + y * ca - bb.y0];
    for (const el of elements) {
      if (el.kind === 'straight') {
        el.p0 = xf(el.p0);
        el.p1 = xf(el.p1);
        el.ang -= bb.angle;
      } else {
        el.C = xf(el.C);
        el.phi0 -= bb.angle;
        el.phi1 -= bb.angle;
      }
    }
    pieces.push({
      index: pieces.length + 1,
      elements,
      folds: folds.map((f) => ({ ...f, p: xf(f.p), ang: f.ang - bb.angle })),
      end: { p: xf(P), ang: ang - bb.angle, joinFold },
      start: { p: xf([0, 0]), ang: -bb.angle },
      bbox: { w: bb.w, h: bb.h },
      outerLen,
      turn: turnAcc,
    });
  }

  resetPiece();
  let prevTurn = 'S'; // turn at the chain's current position (after step k-1)
  let foldsPrinted = 0;
  const joints = [];
  for (let k = 0; k < n; k++) {
    const g = stepGeom(steps[k].dir);
    const bb = chordBBox(pts.concat(g.newPts, tabPoints(g.p1, g.ang1)), g.p1);
    const fits = bb.w <= usableW && bb.h <= Math.min(usableH, bandCap)
      && turnAcc + g.turn <= maxTurn + 1e-9;
    if (!fits && outerLen > 0) {
      // cut here: if the position is a junction the joint absorbs that fold
      const joinFold = prevTurn !== 'S' ? prevTurn : null;
      if (joinFold) foldsPrinted--; // it was recorded as a fold; reclaim it
      if (joinFold) folds.pop();
      finalizePiece(joinFold);
      joints.push({ atJunction: !!joinFold });
      resetPiece();
      prevTurn = 'S';
      k--;
      continue;
    }
    applyStep(g);
    if (steps[k].turn !== 'S' && k < n - 1) {
      folds.push({ p: [...P], ang, turn: steps[k].turn });
      foldsPrinted++;
    }
    prevTurn = steps[k].turn;
  }
  // close the loop: the final joint absorbs the closing turn (if any)
  const closingFold = steps[n - 1].turn !== 'S' ? steps[n - 1].turn : null;
  finalizePiece(closingFold);
  joints.push({ atJunction: !!closingFold });

  // shelf-pack pieces (in assembly order) onto landscape pages
  const placements = [];
  let pageCount = 1;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const pc of pieces) {
    if (x + pc.bbox.w > usableW + 1e-9) {
      y += rowH + gap;
      x = 0;
      rowH = 0;
    }
    if (y + pc.bbox.h > usableH + 1e-9) {
      pageCount++;
      x = 0;
      y = 0;
      rowH = 0;
    }
    placements.push({ page: pageCount, piece: pc.index, x, y });
    x += pc.bbox.w + gap;
    rowH = Math.max(rowH, pc.bbox.h);
  }

  const totalTurns = steps.reduce((s, t) => s + (t.turn !== 'S' ? 1 : 0), 0);
  return {
    pieces,
    placements,
    pageCount,
    totalOuterLength: pieces.reduce((s, p) => s + p.outerLen, 0),
    foldsPrinted,
    joints,
    totalTurns,
    R,
    thetaC,
    wallHeight: w,
    tab,
    margin,
    gap,
    maxTurn,
    usableW,
    usableH,
  };
}

/** Sample a piece's outer and inner edges as polylines (for drawing/tests). */
export function pieceOutline(piece, wallHeight, { arcStep = Math.PI / 72 } = {}) {
  const outer = [];
  const inner = [];
  const push = (arr, p) => {
    const q = arr[arr.length - 1];
    if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-9) arr.push(p);
  };
  for (const el of piece.elements) {
    if (el.kind === 'straight') {
      const nl = [Math.cos(el.ang + Math.PI / 2), Math.sin(el.ang + Math.PI / 2)];
      push(outer, el.p0);
      push(outer, el.p1);
      push(inner, [el.p0[0] + wallHeight * nl[0], el.p0[1] + wallHeight * nl[1]]);
      push(inner, [el.p1[0] + wallHeight * nl[0], el.p1[1] + wallHeight * nl[1]]);
    } else {
      const span = el.phi1 - el.phi0;
      const m = Math.max(2, Math.ceil(span / arcStep));
      for (let i = 0; i <= m; i++) {
        const ph = el.phi0 + (span * i) / m;
        const co = Math.cos(ph);
        const si = Math.sin(ph);
        push(outer, [el.C[0] + el.r * co, el.C[1] + el.r * si]);
        push(inner, [el.C[0] + (el.r - wallHeight) * co, el.C[1] + (el.r - wallHeight) * si]);
      }
    }
  }
  return { outer, inner };
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
