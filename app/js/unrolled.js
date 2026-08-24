// Flat "unrolled" preview: the cylinder cut open and laid out as the printed
// sheet would be — a light cell grid with the Hamiltonian path drawn over it.
//
// Coordinates come straight from geometry.buildSheet(): mm, x = circumference
// (columns), y = height (rows), origin top-left, so what you see here is the
// same frame the tile PDF prints in. The seam edges are dashed to match the
// blue seam verticals on those tiles.
//
// The view is pannable/zoomable: scroll (or pinch) zooms about the cursor,
// drag pans, double-click returns to the fitted view. Transform state is
// {scale, tx, ty} with screen = mm * scale + t, and the maths lives in pure
// helpers so it can be exercised in Node.

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

export const ZOOM_MIN = 0.75; // relative to the fitted scale
export const ZOOM_MAX = 60;

/** The fitted view as a {scale, tx, ty} transform. */
export function fitView(sheet, viewW, viewH, pad = 30) {
  const { k, ox, oy } = fitTransform(sheet, viewW, viewH, pad);
  return { scale: k, tx: ox, ty: oy };
}

/**
 * Scale about a screen point, keeping the sheet point under it fixed.
 * `fitScale` bounds how far in/out the user can go.
 */
export function zoomAbout(view, px, py, factor, fitScale) {
  const lo = fitScale * ZOOM_MIN;
  const hi = fitScale * ZOOM_MAX;
  const scale = Math.max(lo, Math.min(hi, view.scale * factor));
  const applied = view.scale > 0 ? scale / view.scale : 1;
  return {
    scale,
    tx: px - (px - view.tx) * applied,
    ty: py - (py - view.ty) * applied,
  };
}

/**
 * Keep at least `keep` px of the sheet inside the viewport, so it can never be
 * flung off-screen and lost.
 */
export function clampView(view, sheet, viewW, viewH, keep = 60) {
  const sw = sheet.widthMM * view.scale;
  const sh = sheet.heightMM * view.scale;
  const kx = Math.min(keep, sw);
  const ky = Math.min(keep, sh);
  return {
    scale: view.scale,
    tx: Math.max(-sw + kx, Math.min(viewW - kx, view.tx)),
    ty: Math.max(-sh + ky, Math.min(viewH - ky, view.ty)),
  };
}

export class UnrolledView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sheet = null;
    this.stats = null;
    this.view = null;      // {scale, tx, ty}; null until first fit
    this.fitScale = 0;     // scale of the fitted view, for zoom bounds
    this._drag = null;
    // a window resize keeps the user's framing — it just re-clamps, so opening
    // devtools or resizing the window doesn't throw away where they were looking
    this._onResize = () => {
      if (this.view && this.sheet) {
        const [w, h] = this._viewport();
        if (w > 0 && h > 0) this.view = clampView(this.view, this.sheet, w, h);
      }
      this.draw();
    };
    window.addEventListener('resize', this._onResize);
    this._bindInteraction();
  }

  /** Redraw from a sheet (geometry.buildSheet) + stats. Returns draw ms. */
  update(sheet, stats) {
    const t0 = performance.now();
    const prev = this.sheet;
    const sameSheet = prev
      && prev.widthMM === sheet.widthMM
      && prev.heightMM === sheet.heightMM;
    this.sheet = sheet;
    this.stats = stats;
    // hold the user's framing across a seed reroll; refit when the sheet resizes
    if (!sameSheet) this.view = null;
    this.draw();
    return performance.now() - t0;
  }

  /** Drop back to the fitted view on the next draw. */
  resetView() {
    this.view = null;
  }

  _viewport() {
    const host = this.canvas.parentElement;
    return [host.clientWidth, host.clientHeight];
  }

  _bindInteraction() {
    const c = this.canvas;
    c.style.touchAction = 'none';

    c.addEventListener('wheel', (e) => {
      if (!this.sheet || !this.view) return;
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      // trackpad pinch arrives as ctrl+wheel; treat it as a stronger zoom
      const step = e.deltaY * (e.ctrlKey ? 0.008 : 0.0018);
      const [w, h] = this._viewport();
      this.view = clampView(
        zoomAbout(this.view, e.clientX - rect.left, e.clientY - rect.top,
          Math.exp(-step), this.fitScale),
        this.sheet, w, h,
      );
      this.draw();
    }, { passive: false });

    c.addEventListener('pointerdown', (e) => {
      if (!this.sheet || !this.view) return;
      this._drag = { x: e.clientX, y: e.clientY };
      c.setPointerCapture(e.pointerId);
      c.style.cursor = 'grabbing';
    });

    c.addEventListener('pointermove', (e) => {
      if (!this._drag || !this.view) return;
      const [w, h] = this._viewport();
      this.view = clampView({
        scale: this.view.scale,
        tx: this.view.tx + (e.clientX - this._drag.x),
        ty: this.view.ty + (e.clientY - this._drag.y),
      }, this.sheet, w, h);
      this._drag = { x: e.clientX, y: e.clientY };
      this.draw();
    });

    const endDrag = (e) => {
      if (!this._drag) return;
      this._drag = null;
      c.releasePointerCapture?.(e.pointerId);
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerup', endDrag);
    c.addEventListener('pointercancel', endDrag);

    c.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.resetView();
      this.draw();
    });

    c.style.cursor = 'grab';
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

    const fitted = fitView(sheet, w, h);
    this.fitScale = fitted.scale;
    if (!(fitted.scale > 0)) return;
    if (!this.view) this.view = fitted;
    const { scale: k, tx: ox, ty: oy } = this.view;
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
    if (sheet.segments.length <= 8000) {
      // the glow is the expensive part; drop it where it would only smear
      ctx.shadowColor = 'rgba(255, 180, 94, 0.45)';
      ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    for (const s of sheet.segments) {
      ctx.moveTo(X(s.x1), Y(s.y1));
      ctx.lineTo(X(s.x2), Y(s.y2));
    }
    ctx.stroke();
    ctx.restore();

    // caption above the sheet — below it would collide with the stage readout
    ctx.save();
    ctx.fillStyle = LABEL;
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const zoomPct = this.fitScale > 0 ? Math.round((k / this.fitScale) * 100) : 100;
    const caption = `unrolled sheet · ${cols}×${rows} cells · `
      + `${sheet.widthMM.toFixed(0)} × ${sheet.heightMM.toFixed(0)} mm · dashed = glue seam`
      + (zoomPct === 100 ? '' : ` · ${zoomPct}%`);
    // chip behind the text: at high zoom the path underneath is solid amber
    const tw = ctx.measureText(caption).width;
    ctx.fillStyle = 'rgba(8, 17, 32, 0.85)';
    ctx.fillRect(w / 2 - tw / 2 - 7, 16 - 9, tw + 14, 18);
    ctx.fillStyle = LABEL;
    ctx.fillText(caption, w / 2, 16); // pinned to the viewport, not the sheet
    ctx.restore();
  }
}
