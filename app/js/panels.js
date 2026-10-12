// Flat-panel build: the unrolled cycle split into N flat panels of a prism
// (square, hexagon, octagon...), built from square-section wood strips glued
// onto acetate laid over the printed template.
//
// The path is the part that stays: a corridor through every cell whose wall
// faces sit `inset` mm in from the grid lines wherever the path does not
// cross. Wherever two path runs lie side by side there is a 2·inset gap
// straddling the grid line; those gaps (the non-path area) are cut out of the
// acetate afterwards, so light passes straight through them while the path
// itself diffuses it.
//
// Every cell is split on a 3×3 sub-grid at offsets [0, inset, cell − inset]:
// the centre is always path, each edge-middle square is path iff the cycle
// crosses that side, and the corners never are. The boundary of that union
// is the set of wall faces. Strips sit on the path side of each face. At an
// outside corner the horizontal strip runs through and the vertical one stops
// short by one strip width; at an inside corner the horizontal strip runs on
// by one strip width to fill the corner. Horizontal strips that reach a panel
// edge are mitred so they meet the next panel's strip at the prism corner.
//
// Pure data-in/data-out, mm throughout, panel-local coordinates with the
// origin at the panel's top-left (x along the circumference, y down).

const N = 1;
const E = 2;
const S = 4;
const W = 8;

/** Smallest column count step that keeps cols even and divisible by `panels`. */
export function colsStep(panels) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  return (2 * panels) / gcd(2, panels);
}

/** Bitmask of open sides (N/E/S/W) per cell, from the cycle (columns wrap). */
export function openSides(cycle) {
  const { width: Wd, path } = cycle;
  const n = path.length;
  const sides = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const a = path[k];
    const b = path[(k + 1) % n];
    const ra = Math.floor(a / Wd);
    const ca = a % Wd;
    const rb = Math.floor(b / Wd);
    const cb = b % Wd;
    if (ra === rb) {
      const east = cb === (ca + 1) % Wd;
      sides[a] |= east ? E : W;
      sides[b] |= east ? W : E;
    } else {
      const south = rb > ra;
      sides[a] |= south ? S : N;
      sides[b] |= south ? N : S;
    }
  }
  return sides;
}

function codeFor(i) {
  let s = '';
  let k = i;
  do {
    s = String.fromCharCode(65 + (k % 26)) + s;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return s;
}

// merge runs of true cells in each row of a boolean grid into rectangles
function rowRects(grid, nr, nc, xs, ys, want) {
  const out = [];
  for (let r = 0; r < nr; r++) {
    let c = 0;
    while (c < nc) {
      if (grid[r * nc + c] !== want) {
        c++;
        continue;
      }
      const c0 = c;
      while (c < nc && grid[r * nc + c] === want) c++;
      out.push({ x: xs[c0], y: ys[r], w: xs[c] - xs[c0], h: ys[r + 1] - ys[r] });
    }
  }
  return out;
}

function countComponents(keep, nr, nc) {
  const seen = new Uint8Array(nr * nc);
  let count = 0;
  const stack = [];
  for (let i = 0; i < nr * nc; i++) {
    if (!keep[i] || seen[i]) continue;
    count++;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const v = stack.pop();
      const r = Math.floor(v / nc);
      const c = v % nc;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || rr >= nr || cc < 0 || cc >= nc) continue;
        const u = rr * nc + cc;
        if (keep[u] && !seen[u]) {
          seen[u] = 1;
          stack.push(u);
        }
      }
    }
  }
  return count;
}

/** First-fit-decreasing: how many stock lengths cover the strip list. */
export function packStock(lengths, stock, kerf) {
  const bins = [];
  for (const L of [...lengths].sort((a, b) => b - a)) {
    const need = L + kerf;
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] + need <= stock + 1e-9) {
        bins[i] += need;
        placed = true;
        break;
      }
    }
    if (!placed) bins.push(need);
  }
  return bins;
}

/**
 * Build the flat-panel template data.
 * Returns {panels, cutList, stock, ...}. Each panel:
 *   {index, widthMM, heightMM, colStart, keep: rects, cut: rects,
 *    walls: [{x, y, w, h, orient, len, ends, code}], pieces}
 * `pieces` is the number of separate path pieces of acetate left on that
 * panel after the gaps are cut out (each one runs off a panel edge).
 */
export function buildPanels(cycle, {
  cellW, cellH, panels, inset, strip, stock = 1000, kerf = 1.5,
} = {}) {
  const { width: cols, height: rows } = cycle;
  if (!(panels >= 3)) throw new Error('need at least 3 panels');
  if (cols % panels) throw new Error(`${cols} columns do not split into ${panels} panels`);
  if (!(inset > 0)) throw new Error('inset must be > 0');
  if (!(strip > 0)) throw new Error('strip size must be > 0');
  const clear = Math.min(cellW, cellH) - 2 * inset - 2 * strip;
  if (clear <= 0) {
    throw new Error(`cell too small: ${Math.min(cellW, cellH)} mm leaves no channel inside `
      + `2×${inset} mm inset + 2×${strip} mm walls`);
  }

  const sides = openSides(cycle);
  const n = cols / panels; // columns per panel
  const nc = 3 * n;
  const nr = 3 * rows;
  const xs = [];
  for (let j = 0; j < n; j++) xs.push(j * cellW, j * cellW + inset, (j + 1) * cellW - inset);
  xs.push(n * cellW);
  const ys = [];
  for (let r = 0; r < rows; r++) ys.push(r * cellH, r * cellH + inset, (r + 1) * cellH - inset);
  ys.push(rows * cellH);
  const mitre = 180 / panels; // degrees off square at a prism corner

  const out = [];
  const allStrips = [];
  for (let p = 0; p < panels; p++) {
    const keep = new Uint8Array(nr * nc);
    for (let r = 0; r < rows; r++) {
      for (let j = 0; j < n; j++) {
        const sd = sides[r * cols + p * n + j];
        const at = (sr, sc) => (3 * r + sr) * nc + 3 * j + sc;
        keep[at(1, 1)] = 1;
        if (sd & N) keep[at(0, 1)] = 1;
        if (sd & S) keep[at(2, 1)] = 1;
        if (sd & W) keep[at(1, 0)] = 1;
        if (sd & E) keep[at(1, 2)] = 1;
      }
    }
    const K = (r, c) => (r >= 0 && r < nr && c >= 0 && c < nc ? keep[r * nc + c] : 0);

    const walls = [];
    // horizontal wall faces: between fine rows i-1 and i
    for (let i = 0; i <= nr; i++) {
      let c = 0;
      while (c < nc) {
        const up = K(i - 1, c);
        const dn = K(i, c);
        if (up === dn) {
          c++;
          continue;
        }
        const side = dn ? 1 : -1; // +1: path below the face
        const c0 = c;
        while (c < nc && K(i - 1, c) !== K(i, c) && (K(i, c) ? 1 : -1) === side) c++;
        const kr = side > 0 ? i : i - 1;
        const end0 = c0 === 0 ? 'panel' : K(kr, c0 - 1) ? 'inside' : 'outside';
        const end1 = c === nc ? 'panel' : K(kr, c) ? 'inside' : 'outside';
        const x0 = xs[c0] - (end0 === 'inside' ? strip : 0);
        const x1 = xs[c] + (end1 === 'inside' ? strip : 0);
        const y = ys[i];
        walls.push({
          orient: 'h',
          x: x0,
          y: side > 0 ? y : y - strip,
          w: x1 - x0,
          h: strip,
          len: x1 - x0,
          ends: [end0 === 'panel' ? 'mitre' : 'square', end1 === 'panel' ? 'mitre' : 'square'],
        });
      }
    }
    // vertical wall faces: between fine cols j-1 and j (panel edges are cuts,
    // not walls, so j = 0 and j = nc are skipped)
    for (let j = 1; j < nc; j++) {
      let r = 0;
      while (r < nr) {
        const lf = K(r, j - 1);
        const rt = K(r, j);
        if (lf === rt) {
          r++;
          continue;
        }
        const side = rt ? 1 : -1; // +1: path to the right of the face
        const r0 = r;
        while (r < nr && K(r, j - 1) !== K(r, j) && (K(r, j) ? 1 : -1) === side) r++;
        const kc = side > 0 ? j : j - 1;
        const end0 = K(r0 - 1, kc) ? 'inside' : 'outside';
        const end1 = K(r, kc) ? 'inside' : 'outside';
        const y0 = ys[r0] + (end0 === 'outside' ? strip : 0);
        const y1 = ys[r] - (end1 === 'outside' ? strip : 0);
        const x = xs[j];
        walls.push({
          orient: 'v',
          x: side > 0 ? x : x - strip,
          y: y0,
          w: strip,
          h: y1 - y0,
          len: y1 - y0,
          ends: ['square', 'square'],
        });
      }
    }

    // strips longer than the stock are split into equal butt-jointed lengths
    const split = [];
    for (const wl of walls) {
      const parts = Math.max(1, Math.ceil(wl.len / (stock - kerf) - 1e-9));
      if (parts === 1) {
        split.push(wl);
        continue;
      }
      const L = wl.len / parts;
      for (let k = 0; k < parts; k++) {
        const ends = [k === 0 ? wl.ends[0] : 'square', k === parts - 1 ? wl.ends[1] : 'square'];
        split.push(wl.orient === 'h'
          ? { ...wl, x: wl.x + k * L, w: L, len: L, ends, joined: true }
          : { ...wl, y: wl.y + k * L, h: L, len: L, ends, joined: true });
      }
    }
    for (const wl of split) allStrips.push(wl);

    out.push({
      index: p + 1,
      colStart: p * n,
      widthMM: n * cellW,
      heightMM: rows * cellH,
      keep: rowRects(keep, nr, nc, xs, ys, 1),
      cut: rowRects(keep, nr, nc, xs, ys, 0),
      walls: split,
      pieces: countComponents(keep, nr, nc),
    });
  }

  // cut list: identical length + end treatment share a code, longest first
  const keyOf = (wl) => {
    const m = wl.ends.filter((e) => e === 'mitre').length;
    return `${(Math.round(wl.len * 2) / 2).toFixed(1)}|${m}`;
  };
  const groups = new Map();
  for (const wl of allStrips) {
    const key = keyOf(wl);
    if (!groups.has(key)) {
      groups.set(key, { len: Math.round(wl.len * 2) / 2, mitres: wl.ends.filter((e) => e === 'mitre').length, count: 0 });
    }
    groups.get(key).count++;
  }
  const cutList = [...groups.entries()]
    .sort((a, b) => b[1].len - a[1].len || b[1].mitres - a[1].mitres)
    .map(([key, g], i) => ({ key, code: codeFor(i), ...g }));
  const codeOf = new Map(cutList.map((g) => [g.key, g.code]));
  for (const wl of allStrips) wl.code = codeOf.get(keyOf(wl));

  const sticks = packStock(allStrips.map((wl) => wl.len), stock, kerf);
  const pw = n * cellW;
  return {
    panels: out,
    cutList,
    strips: allStrips.length,
    totalLength: allStrips.reduce((s, wl) => s + wl.len, 0),
    sticks: sticks.length,
    stock,
    kerf,
    panelCount: panels,
    colsPerPanel: n,
    panelW: pw,
    panelH: rows * cellH,
    inset,
    strip,
    gap: 2 * inset,
    clear,
    mitre,
    acrossFlats: pw / Math.tan(Math.PI / panels),
    acrossCorners: pw / Math.sin(Math.PI / panels),
    pieces: out.reduce((s, p) => s + p.pieces, 0),
  };
}

// ─────────────────── A4 tiling of one panel ───────────────────
function clipRect(rc, x0, y0, x1, y1) {
  const a = Math.max(rc.x, x0);
  const b = Math.max(rc.y, y0);
  const c = Math.min(rc.x + rc.w, x1);
  const d = Math.min(rc.y + rc.h, y1);
  if (c - a <= 1e-9 || d - b <= 1e-9) return null;
  return { ...rc, x: a, y: b, w: c - a, h: d - b };
}

/**
 * Tile each panel onto A4 portrait pages. Rects arrive clipped and in
 * page-local mm (origin at the paper's top-left corner).
 */
export function buildPanelTiles(build, { margin = 8, A4 = { w: 210, h: 297 } } = {}) {
  const usableW = A4.w - 2 * margin;
  const usableH = A4.h - 2 * margin;
  const pages = [];
  for (const pn of build.panels) {
    const ncol = Math.max(1, Math.ceil(pn.widthMM / usableW - 1e-9));
    const nrow = Math.max(1, Math.ceil(pn.heightMM / usableH - 1e-9));
    for (let r = 0; r < nrow; r++) {
      for (let c = 0; c < ncol; c++) {
        const ox = c * usableW;
        const oy = r * usableH;
        const win = [ox, oy, ox + usableW, oy + usableH];
        const local = (rc) => ({ ...rc, x: rc.x - ox + margin, y: rc.y - oy + margin });
        const clip = (list) => list.map((rc) => clipRect(rc, ...win)).filter(Boolean).map(local);
        const edges = [];
        for (const ex of [0, pn.widthMM]) {
          if (ex >= ox - 1e-9 && ex <= ox + usableW + 1e-9) edges.push(ex - ox + margin);
        }
        pages.push({
          panel: pn.index,
          row: r + 1,
          col: c + 1,
          nrow,
          ncol,
          label: `P${pn.index} R${r + 1}C${c + 1}`,
          ox,
          oy,
          cut: clip(pn.cut),
          walls: clip(pn.walls),
          edges,
          extentW: Math.min(usableW, pn.widthMM - ox),
          extentH: Math.min(usableH, pn.heightMM - oy),
        });
      }
    }
  }
  return { pages, margin, usableW, usableH };
}

// ─────────────────── 3D prism geometry ───────────────────
/**
 * Map panel-local (u, v) mm onto the prism: returns a function giving
 * [x, y, z] (y up, row 0 at the top) for a point `depth` mm inward from the
 * panel face. Panel p is centred on angle 2π(p + 0.5)/P, matching the
 * cylinder's column angles.
 */
export function prismMapper(build) {
  const { panelCount: P, panelW: pw, panelH: H } = build;
  const ap = pw / (2 * Math.tan(Math.PI / P));
  return (p, u, v, depth = 0) => {
    const th = (2 * Math.PI * (p + 0.5)) / P;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const t = u - pw / 2;
    const rr = ap - depth;
    return [rr * ct - t * st, H - v, rr * st + t * ct];
  };
}
