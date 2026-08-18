// Flat "unrolled" preview: the cylinder cut open and laid out as the printed
// sheet would be — a light cell grid with the Hamiltonian path drawn over it.
//
// Coordinates come straight from geometry.buildSheet(): mm, x = circumference
// (columns), y = height (rows), origin top-left, so what you see here is the
// same frame the tile PDF prints in. The seam edges are dashed to match the
// blue seam verticals on those tiles.

const PATH = '#ffb45e';
const GRID = 'rgba(127, 179, 224, 0.26)';
const EDGE = 'rgba(127, 179, 224, 0.55)';
const SEAM = '#7fb3e0';
const LABEL = 'rgba(109, 132, 160, 0.9)';

const MIN_GRID_PX = 6; // below this pitch the grid is noise, so skip it

/**
 * Fit a sheet into a viewport, preserving aspect and centring it.
 * Pure: no DOM, so the layout maths is testable in Node.
 */
export function fitTransform(sheet, viewW, viewH, pad = 30) {
  const availW = viewW - 2 * pad;
  const availH = viewH - 2 * pad;
  if (!(availW > 0) || !(availH > 0) || !(sheet.widthMM > 0) || !(sheet.heightMM > 0)) {
    return { k: 0, ox: 0, oy: 0 };
  }
  const k = Math.min(availW / sheet.widthMM, availH / sheet.heightMM);
  return {
    k,
    ox: (viewW - sheet.widthMM * k) / 2,
    oy: (viewH - sheet.heightMM * k) / 2,
  };
}

export class UnrolledView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sheet = null;
    this.stats = null;
    this._onResize = () => this.draw();
    window.addEventListener('resize', this._onResize);
  }

  /** Redraw from a sheet (geometry.buildSheet) + stats. Returns draw ms. */
  update(sheet, stats) {
    const t0 = performance.now();
    this.sheet = sheet;
    this.stats = stats;
    this.draw();
    return performance.now() - t0;
  }

  draw() {
    const { canvas, ctx, sheet } = this;
    const host = canvas.parentElement;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!(w > 0) || !(h > 0)) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!sheet) return;

    const { k, ox, oy } = fitTransform(sheet, w, h);
    if (!(k > 0)) return;
    const X = (mm) => ox + mm * k;
    const Y = (mm) => oy + mm * k;
    const right = X(sheet.widthMM);
    const bottom = Y(sheet.heightMM);

    // cell grid, drawn lightly — one path, one stroke
    const cols = Math.round(sheet.widthMM / sheet.cellW);
    const rows = Math.round(sheet.heightMM / sheet.cellH);
    if (sheet.cellW * k >= MIN_GRID_PX && sheet.cellH * k >= MIN_GRID_PX) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = GRID;
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        const x = X(c * sheet.cellW);
        ctx.moveTo(x, oy);
        ctx.lineTo(x, bottom);
      }
      for (let r = 0; r <= rows; r++) {
        const y = Y(r * sheet.cellH);
        ctx.moveTo(ox, y);
        ctx.lineTo(right, y);
      }
      ctx.stroke();
    }

    // sheet outline
    ctx.lineWidth = 1;
    ctx.strokeStyle = EDGE;
    ctx.strokeRect(ox, oy, right - ox, bottom - oy);

    // seam edges: these two verticals are glued to each other when rolled
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = SEAM;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox, bottom);
    ctx.moveTo(right, oy);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.restore();

    // the path itself
    ctx.save();
    ctx.strokeStyle = PATH;
    ctx.lineWidth = Math.max(1.2, Math.min(sheet.cellW, sheet.cellH) * k * 0.16);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255, 180, 94, 0.45)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (const s of sheet.segments) {
      ctx.moveTo(X(s.x1), Y(s.y1));
      ctx.lineTo(X(s.x2), Y(s.y2));
    }
    ctx.stroke();
    ctx.restore();

    // caption above the sheet — below it would collide with the stage readout
    ctx.fillStyle = LABEL;
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `unrolled sheet · ${cols}×${rows} cells · ${sheet.widthMM.toFixed(0)} × ${sheet.heightMM.toFixed(0)} mm`,
      (ox + right) / 2,
      Math.max(oy - 10, 12),
    );
  }
}
