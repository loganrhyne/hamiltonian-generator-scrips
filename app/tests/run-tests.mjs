#!/usr/bin/env node
// Dependency-free test suite for the lamp designer's core modules.
// Run: node app/tests/run-tests.mjs

import { generateCycle, verifyCycle, cycleSegments, cycleSteps } from '../js/cycle.js';
import { buildSheet, buildStrips, buildTiles, buildWallMesh, computeStats, A4 } from '../js/geometry.js';

let passed = 0;
let failed = 0;
const failures = [];

function check(cond, label) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL ${label}`);
  }
}

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ─────────────────── 1. cycle correctness sweep ───────────────────
console.log('1. cycle validity sweep');
const sizes = [
  [2, 2], [4, 4], [4, 6], [6, 4], [2, 10], [10, 2], [8, 18], [10, 10],
  [20, 20], [40, 60], [100, 4], [4, 100], [60, 40], [100, 100],
];
let combos = 0;
for (const [w, h] of sizes) {
  for (const tree of ['prim', 'backtracker']) {
    for (const seed of [0, 1, 42]) {
      for (const wrap of [true, false]) {
        const c = generateCycle(w, h, { seed, tree, wrap });
        const [ok, msg] = verifyCycle(c, { wrap });
        combos++;
        if (!ok) check(false, `cycle ${w}x${h} ${tree} seed=${seed} wrap=${wrap}: ${msg}`);
      }
    }
  }
}
check(true, 'sweep ran');
console.log(`  ${combos} configurations verified`);

// odd sizes must be rejected
for (const [w, h] of [[5, 4], [4, 5], [3, 3]]) {
  let threw = false;
  try { generateCycle(w, h); } catch { threw = true; }
  check(threw, `odd size ${w}x${h} rejected`);
}

// ─────────────────── 2. determinism ───────────────────
console.log('2. seed determinism');
{
  const a = generateCycle(20, 30, { seed: 7 });
  const b = generateCycle(20, 30, { seed: 7 });
  const c = generateCycle(20, 30, { seed: 8 });
  check(a.path.every((v, i) => v === b.path[i]), 'same seed -> same path');
  check(!c.path.every((v, i) => v === a.path[i]), 'different seed -> different path');
}

// ─────────────────── 3. turning number ───────────────────
// The dual-tree cycle bounds a thickened tree, so it is contractible:
// right turns minus left turns must be exactly ±4, even across the seam.
console.log('3. turning number');
for (const [w, h] of [[4, 4], [8, 18], [40, 40], [100, 100]]) {
  const steps = cycleSteps(generateCycle(w, h, { seed: 3 }));
  const t = steps.reduce((s, x) => s + (x.turn === 'R' ? 1 : x.turn === 'L' ? -1 : 0), 0);
  check(Math.abs(t) === 4, `turning number ${w}x${h} = ${t}`);
}

// ─────────────────── 4. segments & sheet scaling ───────────────────
console.log('4. segments & sheet');
for (const [w, h] of [[8, 18], [40, 40], [100, 100]]) {
  const cyc = generateCycle(w, h, { seed: 11 });
  const segs = cycleSegments(cyc);
  const n = w * h;
  const segLen = (s) => Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
  const total = segs.reduce((s, x) => s + segLen(x), 0);
  check(approx(total, n), `seg total length ${w}x${h}: ${total} == ${n} edges`);
  const crossings = segs.length - n;
  check(crossings >= 0 && crossings % 2 === 0, `seam stubs come in pairs (${crossings})`);
  check(
    segs.every((s) => s.x1 >= -0.5 && s.x2 <= w - 0.5 && s.y1 >= 0 && s.y2 <= h - 1),
    `segments in bounds ${w}x${h}`,
  );

  const cellW = 12.5;
  const cellH = 7.5;
  const sheet = buildSheet(cyc, { cellW, cellH });
  check(approx(sheet.widthMM, w * cellW) && approx(sheet.heightMM, h * cellH), `sheet dims ${w}x${h}`);
  check(
    sheet.segments.every(
      (s) => s.x1 >= -1e-9 && s.x2 <= sheet.widthMM + 1e-9
        && s.y1 >= 0 && s.y2 <= sheet.heightMM,
    ),
    `sheet segments inside [0, ${w * cellW}] x [0, ${h * cellH}]`,
  );
  const mmTotal = sheet.segments.reduce((s, x) => s + segLen(x), 0);
  // every fine edge is cellW (horizontal) or cellH (vertical) long
  const steps = cycleSteps(cyc);
  const expect = steps.reduce((s, x) => s + (x.dir === 'h' ? cellW : cellH), 0);
  check(approx(mmTotal, expect, 1e-6), `sheet mm length conserved (${mmTotal.toFixed(3)})`);
}

// ─────────────────── 5. wall strips ───────────────────
console.log('5. wall strips');
for (const [w, h, cellW, cellH, wall] of [[8, 18, 60, 60, 20], [100, 100, 10, 10, 15], [12, 30, 6, 5, 8]]) {
  const cyc = generateCycle(w, h, { seed: 23 });
  const sd = buildStrips(cyc, { cellW, cellH, wallHeight: wall });
  const steps = cycleSteps(cyc);
  const expect = steps.reduce((s, x) => s + (x.dir === 'h' ? cellW : cellH), 0);
  const sum = sd.strips.reduce((s, x) => s + x.length, 0);
  check(approx(sum, expect, 1e-6), `strip lengths sum to ribbon (${w}x${h})`);
  check(approx(sum, sd.totalLength, 1e-6), 'totalLength agrees');
  check(sd.strips.every((s) => s.length <= sd.stripCapacity + 1e-6), 'every strip fits its page');
  check(
    sd.strips.every((s) => s.folds.every((f) => f.pos > -1e-9 && f.pos < s.length + 1e-9)),
    'folds inside their strip',
  );
  const foldSum = sd.strips.reduce((s, x) => s + x.folds.length, 0);
  check(foldSum === sd.foldCount, `fold count conserved (${foldSum})`);
  // reconstruct global fold positions from strip-local ones
  const globals = [];
  let off = 0;
  for (const s of sd.strips) {
    for (const f of s.folds) globals.push(off + f.pos);
    off += s.length;
  }
  let t = 0;
  const expected = [];
  for (let k = 0; k < steps.length; k++) {
    t += steps[k].dir === 'h' ? cellW : cellH;
    if (steps[k].turn !== 'S' && k < steps.length - 1) expected.push(t);
  }
  check(
    globals.length === expected.length && globals.every((g, i) => approx(g, expected[i], 1e-6)),
    'global fold positions preserved across cuts',
  );
  // no fold sits closer than 1mm to a cut unless cells are tinier than 2mm
  const minCell = Math.min(cellW, cellH);
  off = 0;
  let clear = true;
  for (const s of sd.strips.slice(0, -1)) {
    off += s.length;
    for (const g of globals) {
      if (Math.abs(g - off) < Math.min(1, minCell / 2 - 1e-9)) clear = false;
    }
  }
  check(clear, 'cuts keep clearance from folds');
  // page layout: strips per page never exceeds capacity
  check(sd.pages.every((p) => p.strips.length <= sd.perPage), 'strip page rows fit');
  check(
    sd.pages.flatMap((p) => p.strips).length === sd.strips.length,
    'every strip landed on a page',
  );
}

// ─────────────────── 6. A4 tiling ───────────────────
console.log('6. A4 tiling');
for (const [w, h, cellW, cellH] of [[8, 18, 60, 60], [100, 100, 10, 10], [6, 8, 20, 25]]) {
  const cyc = generateCycle(w, h, { seed: 5 });
  const sheet = buildSheet(cyc, { cellW, cellH });
  const tiles = buildTiles(sheet, { margin: 8 });
  const { usableW, usableH, nrow, ncol, margin } = tiles;
  check(nrow === Math.ceil(sheet.heightMM / usableH), `tile rows ${w}x${h}`);
  check(ncol === Math.ceil(sheet.widthMM / usableW), `tile cols ${w}x${h}`);
  check(tiles.pages.length === nrow * ncol, 'page count = rows x cols');
  check(
    tiles.pages.every((p) => p.segments.every(
      (s) => s.x1 >= margin - 1e-6 && s.x2 <= margin + usableW + 1e-6
        && s.y1 >= margin - 1e-6 && s.y2 <= margin + usableH + 1e-6,
    )),
    'clipped segments stay inside the printable window',
  );
  // coverage: every sheet segment must be fully covered by the union of its
  // per-page clips (overlap at window boundaries is fine; gaps are not)
  let covered = 0;
  let totalLen = 0;
  const segLen = (s) => Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
  for (const s of sheet.segments) totalLen += segLen(s);
  for (const p of tiles.pages) for (const s of p.segments) covered += segLen(s);
  check(covered >= totalLen - 1e-3, `tiled coverage ${covered.toFixed(2)} >= ${totalLen.toFixed(2)}`);
  // seam edges visible on first and last tile column
  const firstCol = tiles.pages.filter((p) => p.col === 1);
  const lastCol = tiles.pages.filter((p) => p.col === ncol);
  check(firstCol.every((p) => p.seams.length >= 1), 'left seam marked');
  check(lastCol.every((p) => p.seams.length >= 1), 'right seam marked');
}

// ─────────────────── 7. 3D mesh ───────────────────
console.log('7. wall mesh');
for (const [w, h, cellW, cellH, wall] of [[8, 18, 60, 60, 20], [100, 100, 10, 10, 15]]) {
  const cyc = generateCycle(w, h, { seed: 9 });
  const mesh = buildWallMesh(cyc, { cellW, cellH, wallHeight: wall });
  const R = (w * cellW) / (2 * Math.PI);
  check(approx(mesh.radius, R), `mesh radius ${w}x${h}`);
  const pos = mesh.positions;
  let radiiOk = true;
  let yOk = true;
  for (let i = 0; i < pos.length; i += 3) {
    const r = Math.hypot(pos[i], pos[i + 2]);
    if (!(approx(r, mesh.radius, 1e-3) || approx(r, mesh.innerRadius, 1e-3))) radiiOk = false;
    if (pos[i + 1] < -1e-6 || pos[i + 1] > mesh.heightMM + 1e-6) yOk = false;
  }
  check(radiiOk, 'all vertices on outer or inner radius');
  check(yOk, 'all vertices within cylinder height');
  let idxOk = true;
  for (const ix of mesh.indices) if (ix < 0 || ix >= pos.length / 3) idxOk = false;
  check(idxOk, 'indices in range');
  check(mesh.indices.length % 3 === 0, 'whole triangles');
}

// ─────────────────── 8. performance ───────────────────
console.log('8. performance (cycle gen + full layout pipeline)');
const perf = [];
for (const [w, h] of [[20, 20], [50, 50], [100, 40], [100, 100]]) {
  for (const tree of ['prim', 'backtracker']) {
    const t0 = performance.now();
    const cyc = generateCycle(w, h, { seed: 1, tree });
    const tGen = performance.now() - t0;
    const t1 = performance.now();
    const sheet = buildSheet(cyc, { cellW: 10, cellH: 10 });
    const strips = buildStrips(cyc, { cellW: 10, cellH: 10, wallHeight: 15 });
    const tiles = buildTiles(sheet);
    const mesh = buildWallMesh(cyc, { cellW: 10, cellH: 10, wallHeight: 15 });
    const tLayout = performance.now() - t1;
    perf.push({
      size: `${w}x${h}`, tree,
      gen_ms: +tGen.toFixed(1), layout_ms: +tLayout.toFixed(1),
      strips: strips.strips.length, tilePages: tiles.pages.length,
      tris: mesh.indices.length / 3,
    });
    check(tGen < 500, `gen ${w}x${h} ${tree} under 500 ms (${tGen.toFixed(1)} ms)`);
    check(tLayout < 2000, `layout ${w}x${h} ${tree} under 2 s (${tLayout.toFixed(1)} ms)`);
  }
}
console.table(perf);

// ─────────────────── 9. stats ───────────────────
console.log('9. stats');
{
  const s = computeStats({ cols: 8, rows: 18, cellW: 60, cellH: 60, wallHeight: 20 });
  check(approx(s.diameter * Math.PI, s.circumference), 'diameter * pi = circumference');
  check(approx(s.diameter, 152.78874536821954), 'floor-lamp design target Ø152.8mm reproduced');
  check(approx(s.heightMM, 1080), 'floor-lamp height 1080mm reproduced');
  check(A4.w === 210 && A4.h === 297, 'A4 dims');
}

// ─────────────────── summary ───────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.error('failures:', failures.join(' | '));
  process.exit(1);
}
