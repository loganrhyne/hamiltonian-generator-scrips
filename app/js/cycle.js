// Fast Hamiltonian cycles on cylindrical grids via the spanning-tree
// ("dual tree") doubling construction.
//
// JS port of dual_tree_cycle.py. Works on the half-resolution super-grid of
// size (H/2) x (W/2) whose columns wrap (a cylinder). Build a random spanning
// tree of that grid, then "double" it back up to the full H x W grid: every
// super-cell owns a 2x2 block of fine cells wired as a 4-cycle, and every
// spanning-tree edge splices the two neighbouring 4-cycles together. A
// spanning tree on N nodes has N-1 edges, so the N little 4-cycles merge into
// exactly one Hamiltonian cycle. No search, no backtracking — O(W*H).
//
// Pure ESM, no dependencies; runs in the browser and in Node.

// ─────────────────── seeded PRNG ───────────────────
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const rand = mulberry32(seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed);
  return {
    random: rand,
    randrange(k) {
      return Math.floor(rand() * k);
    },
    choice(arr) {
      return arr[Math.floor(rand() * arr.length)];
    },
  };
}

// ─────────────────── super-grid spanning tree ───────────────────
// Super nodes are integer ids i * n + j on the m x n super-grid.
// Columns wrap when `wrap`; rows never do.
function superNbrs(node, m, n, wrap) {
  const i = Math.floor(node / n);
  const j = node % n;
  const out = [];
  if (i > 0) out.push(node - n);
  if (i + 1 < m) out.push(node + n);
  if (n > 1) {
    if (wrap) {
      out.push(i * n + ((j - 1 + n) % n));
      out.push(i * n + ((j + 1) % n));
    } else {
      if (j > 0) out.push(node - 1);
      if (j + 1 < n) out.push(node + 1);
    }
  }
  // de-dupe (n == 2 wrap makes left == right)
  return [...new Set(out)];
}

function spanningTree(m, n, rng, wrap, method) {
  const start = rng.randrange(m) * n + rng.randrange(n);
  const visited = new Uint8Array(m * n);
  visited[start] = 1;
  let count = 1;
  const edges = [];

  if (method === 'backtracker') {
    // randomized DFS — long, winding corridors
    const stack = [start];
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const unv = superNbrs(cur, m, n, wrap).filter((v) => !visited[v]);
      if (!unv.length) {
        stack.pop();
        continue;
      }
      const nxt = rng.choice(unv);
      edges.push([cur, nxt]);
      visited[nxt] = 1;
      count++;
      stack.push(nxt);
    }
  } else if (method === 'prim') {
    // randomized Prim — bushier, more turns
    const frontier = superNbrs(start, m, n, wrap).map((v) => [start, v]);
    while (frontier.length) {
      const k = rng.randrange(frontier.length);
      const [a, b] = frontier[k];
      frontier[k] = frontier[frontier.length - 1];
      frontier.pop();
      if (visited[b]) continue;
      edges.push([a, b]);
      visited[b] = 1;
      count++;
      for (const v of superNbrs(b, m, n, wrap)) {
        if (!visited[v]) frontier.push([b, v]);
      }
    }
  } else {
    throw new Error(`unknown tree method: ${method}`);
  }

  if (count !== m * n) throw new Error('spanning tree did not cover the super-grid');
  return edges;
}

// ─────────────────── doubling / splicing ───────────────────
// Fine cells are integer ids r * W + c. The cycle is 2-regular, so adjacency
// fits in an Int32Array of size N*2 (slots -1 when empty).
function buildCycleAdj(m, n, edges) {
  const W = 2 * n;
  const N = 4 * m * n;
  const adj = new Int32Array(N * 2).fill(-1);

  function link(a, b) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (adj[2 * x] === y || adj[2 * x + 1] === y) continue;
      if (adj[2 * x] === -1) adj[2 * x] = y;
      else if (adj[2 * x + 1] === -1) adj[2 * x + 1] = y;
      else throw new Error(`cell ${x} already has two neighbours`);
    }
  }

  function unlink(a, b) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (adj[2 * x] === y) adj[2 * x] = -1;
      else if (adj[2 * x + 1] === y) adj[2 * x + 1] = -1;
    }
  }

  const id = (r, c) => r * W + c;

  // 1) base 4-cycle for every super-cell
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const r = 2 * i;
      const c = 2 * j;
      const tl = id(r, c);
      const tr = id(r, c + 1);
      const br = id(r + 1, c + 1);
      const bl = id(r + 1, c);
      link(tl, tr);
      link(tr, br);
      link(br, bl);
      link(bl, tl);
    }
  }

  // 2) splice across every tree edge
  for (const [a, b] of edges) {
    const ia = Math.floor(a / n);
    const ja = a % n;
    const ib = Math.floor(b / n);
    const jb = b % n;
    if (ia === ib) {
      // horizontal edge -> resolve left/right
      const i = ia;
      let leftJ;
      let rightJ;
      if (Math.abs(ja - jb) === 1) {
        [leftJ, rightJ] = ja < jb ? [ja, jb] : [jb, ja];
      } else {
        // cylinder seam {0, n-1}
        leftJ = n - 1;
        rightJ = 0;
      }
      const aRight = 2 * leftJ + 1; // right fine column of the left block
      const bLeft = 2 * rightJ; // left fine column of the right block
      const rt = 2 * i;
      const rb = 2 * i + 1;
      unlink(id(rt, aRight), id(rb, aRight)); // left block's right wall
      unlink(id(rt, bLeft), id(rb, bLeft)); // right block's left wall
      link(id(rt, aRight), id(rt, bLeft)); // top connector
      link(id(rb, aRight), id(rb, bLeft)); // bottom connector
    } else {
      // vertical edge -> resolve top/bottom
      const [ti, tj] = ia < ib ? [ia, ja] : [ib, jb];
      const cl = 2 * tj;
      const cr = 2 * tj + 1;
      const ab = 2 * ti + 1; // bottom row of top block
      const bt = 2 * ti + 2; // top row of bottom block
      unlink(id(ab, cl), id(ab, cr)); // top block's bottom wall
      unlink(id(bt, cl), id(bt, cr)); // bottom block's top wall
      link(id(ab, cl), id(bt, cl)); // left connector
      link(id(ab, cr), id(bt, cr)); // right connector
    }
  }

  return adj;
}

function orderPath(adj, total) {
  // Walk the cycle into an ordered Int32Array of cell ids starting at 0.
  const path = new Int32Array(total);
  let prev = -1;
  let v = 0;
  for (let k = 0; k < total; k++) {
    path[k] = v;
    const nxt = adj[2 * v] !== prev ? adj[2 * v] : adj[2 * v + 1];
    prev = v;
    v = nxt;
  }
  return path;
}

// ─────────────────── public API ───────────────────
/**
 * Generate a Hamiltonian cycle on a `width` x `height` cylindrical grid.
 * Both dimensions must be even. Returns {width, height, path} where `path`
 * is an Int32Array of cell ids (id = row * width + col) in cycle order.
 */
export function generateCycle(width, height, { seed = null, tree = 'prim', wrap = true } = {}) {
  if (width % 2 || height % 2) throw new Error('Both width and height must be even numbers');
  if (width < 2 || height < 2) throw new Error('width and height must be >= 2');

  const m = height / 2;
  const n = width / 2;
  const rng = makeRng(seed);
  const edges = spanningTree(m, n, rng, wrap, tree);
  const adj = buildCycleAdj(m, n, edges);
  const path = orderPath(adj, width * height);
  return { width, height, path };
}

/** Check that `cycle` is a single valid Hamiltonian cycle on the grid. */
export function verifyCycle(cycle, { wrap = true } = {}) {
  const { width: W, height: H, path } = cycle;
  const n = W * H;
  if (path.length !== n) return [false, `path length ${path.length} != ${n}`];
  const seen = new Uint8Array(n);
  for (const v of path) {
    if (v < 0 || v >= n) return [false, `cell id ${v} out of range`];
    if (seen[v]) return [false, 'path visits a cell more than once'];
    seen[v] = 1;
  }
  for (let k = 0; k < n; k++) {
    const a = path[k];
    const b = path[(k + 1) % n];
    const ra = Math.floor(a / W);
    const ca = a % W;
    const rb = Math.floor(b / W);
    const cb = b % W;
    const dr = Math.abs(ra - rb);
    let dc = Math.abs(ca - cb);
    if (wrap) dc = Math.min(dc, W - dc);
    if (dr + dc !== 1) return [false, `non-adjacent step (${ra},${ca}) -> (${rb},${cb})`];
  }
  return [true, 'ok'];
}

/**
 * Drawable segments {x1, y1, x2, y2} in cell space (x = col, y = row),
 * splitting seam-crossing edges into half-cell stubs on both ends so the
 * sheet's path stays continuous when rolled into a cylinder.
 */
export function cycleSegments(cycle, { wrap = true } = {}) {
  const { width: W, path } = cycle;
  const n = path.length;
  const segs = [];
  for (let k = 0; k < n; k++) {
    const a = path[k];
    const b = path[(k + 1) % n];
    const ra = Math.floor(a / W);
    const ca = a % W;
    const rb = Math.floor(b / W);
    const cb = b % W;
    if (wrap && ra === rb && Math.abs(ca - cb) === W - 1) {
      // seam crossing
      segs.push({ x1: -0.5, y1: ra, x2: 0, y2: ra });
      segs.push({ x1: W - 1, y1: rb, x2: W - 0.5, y2: rb });
    } else {
      segs.push({ x1: ca, y1: ra, x2: cb, y2: rb });
    }
  }
  return segs;
}

/**
 * The cycle as an ordered list of steps for wall-ribbon construction.
 * Each step is {dir: 'h'|'v', turn: 'L'|'R'|'S'} where `turn` is the turn
 * *after* this step (seen looking at the unrolled sheet with x right, y down;
 * 'L' = counter-clockwise in that frame). Horizontal steps may cross the seam.
 */
export function cycleSteps(cycle, { wrap = true } = {}) {
  const { width: W, path } = cycle;
  const n = path.length;
  const dx = new Int8Array(n);
  const dy = new Int8Array(n);
  for (let k = 0; k < n; k++) {
    const a = path[k];
    const b = path[(k + 1) % n];
    const ra = Math.floor(a / W);
    const ca = a % W;
    const rb = Math.floor(b / W);
    const cb = b % W;
    let ddx = cb - ca;
    if (wrap && Math.abs(ddx) === W - 1) ddx = ddx > 0 ? -1 : 1; // seam crossing
    dx[k] = ddx;
    dy[k] = rb - ra;
  }
  const steps = new Array(n);
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    const cross = dx[k] * dy[k2] - dy[k] * dx[k2];
    steps[k] = {
      dir: dy[k] === 0 ? 'h' : 'v',
      turn: cross === 0 ? 'S' : cross > 0 ? 'R' : 'L',
    };
  }
  return steps;
}
