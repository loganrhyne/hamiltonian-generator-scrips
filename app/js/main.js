// UI wiring for the Hamiltonian Lamp Designer.

import { generateCycle, verifyCycle } from './cycle.js';
import { buildSheet, buildPieces, buildTiles, computeStats } from './geometry.js';
import { buildPanels, buildPanelTiles, colsStep } from './panels.js';
import { makePiecesPDF, makeTilesPDF, makePanelsPDF } from './pdf.js';
import { LampViewer } from './viewer.js';
import { UnrolledView } from './unrolled.js';

const $ = (id) => document.getElementById(id);
const els = {
  cols: $('cols'), rows: $('rows'), seed: $('seed'), tree: $('tree'),
  cellW: $('cellW'), cellH: $('cellH'), wall: $('wall'),
  regen: $('regen'), specs: $('specs'), status: $('status'),
  pathNote: $('path-note'), readout: $('readout'),
  dlStrips: $('dl-strips'), dlTiles: $('dl-tiles'),
  dlStripsSub: $('dl-strips-sub'), dlTilesSub: $('dl-tiles-sub'),
  stage: $('stage'), stageHint: $('stage-hint'),
  tab3d: $('tab-3d'), tabFlat: $('tab-flat'),
  build: $('build'), panels: $('panels'), inset: $('inset'), strip: $('strip'), stock: $('stock'),
  wallField: $('wall-field'), panelFields: $('panel-fields'), buildNote: $('build-note'),
  paperOut: $('paper-out'), panelOut: $('panel-out'),
  dlPanels: $('dl-panels'), dlPanelsSub: $('dl-panels-sub'),
};

const viewer = new LampViewer($('view'));
const flat = new UnrolledView($('view2d'));
const state = {
  cycle: null, params: null, stats: null, pieces: null, tiles: null, sheet: null,
  panelBuild: null, panelTiles: null, panelError: null,
};

const HINTS = { '3d': 'drag to orbit · scroll to zoom', flat: 'drag to pan · scroll to zoom · dbl-click to reset' };

function setView(view) {
  els.stage.dataset.view = view;
  els.tab3d.classList.toggle('is-active', view === '3d');
  els.tabFlat.classList.toggle('is-active', view === 'flat');
  els.stageHint.textContent = HINTS[view];
  if (view === '3d') viewer.resize(); else flat.draw();
}

els.tab3d.addEventListener('click', () => setView('3d'));
els.tabFlat.addEventListener('click', () => setView('flat'));

function readParams() {
  const build = els.build.value;
  const panels = Number(els.panels.value);
  // snap to a multiple of `step` (2 for the cylinder; for panels, also
  // divisible by the panel count so every panel gets whole columns)
  const snap = (el, step = 2) => {
    const lo = Math.ceil(Number(el.min) / step) * step;
    const hi = Math.floor(Number(el.max) / step) * step;
    let v = Math.round((Number(el.value) || 0) / step) * step;
    v = Math.max(lo, Math.min(hi, v));
    if (String(v) !== el.value) el.value = v;
    return v;
  };
  const even = (el) => snap(el, 2);
  const num = (el) => {
    const v = Math.max(Number(el.min), Math.min(Number(el.max), Number(el.value) || Number(el.min)));
    if (Number(el.value) !== v) el.value = v;
    return v;
  };
  els.cols.step = build === 'panels' ? colsStep(panels) : 2;
  return {
    build,
    panels,
    inset: num(els.inset),
    strip: num(els.strip),
    stock: num(els.stock),
    cols: build === 'panels' ? snap(els.cols, colsStep(panels)) : even(els.cols),
    rows: even(els.rows),
    seed: Math.max(0, Math.round(Number(els.seed.value) || 0)),
    tree: els.tree.value,
    cellW: num(els.cellW),
    cellH: num(els.cellH),
    wallHeight: num(els.wall),
  };
}

function fmt(n, d = 1) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
}

function renderPanelSpecs() {
  const { panelBuild: b, panelTiles: t, panelError: err, stats } = state;
  els.dlPanels.disabled = !b;
  if (!b) {
    els.specs.innerHTML = `<dt>panels</dt><dd class="warn">${err}</dd>`;
    els.dlPanelsSub.textContent = `— ${err}`;
    els.buildNote.textContent = '';
    return;
  }
  const rows = [
    ['footprint', `${fmt(b.acrossFlats)} mm across flats`],
    ['height', `${fmt(stats.heightMM, 0)} mm`],
    ['panel', `${fmt(b.panelW, 0)} × ${fmt(b.panelH, 0)} mm · ${b.colsPerPanel} cols`],
    ['gap · channel', `${fmt(b.gap)} mm · ${fmt(b.clear)} mm clear`],
    ['strips', `${b.strips} in ${b.cutList.length} lengths`],
    ['strip total', `${fmt(b.totalLength / 1000, 2)} m · ~${b.sticks} × ${fmt(b.stock, 0)} mm sticks`],
    ['corner mitre', `${fmt(b.mitre)}°`],
    ['path pieces', `${b.pieces} after cutting`, b.pieces > 4 * b.panelCount],
    ['template tiles', `${t.pages.length} pages`, t.pages.length > 30],
  ];
  els.specs.innerHTML = rows
    .map(([k, v, warn]) => `<dt>${k}</dt><dd${warn ? ' class="warn"' : ''}>${v}</dd>`)
    .join('');
  els.dlPanelsSub.textContent = `— ${t.pages.length} template pages + cut list · A4`;
  els.buildNote.textContent = `${b.panelCount} flat panels of ${b.colsPerPanel} columns; `
    + `cols snap to multiples of ${colsStep(b.panelCount)}.`;
}

function renderSpecs() {
  if (state.params.build === 'panels') {
    renderPanelSpecs();
    return;
  }
  els.buildNote.textContent = '';
  const { stats, pieces, tiles } = state;
  const rows = [
    ['cylinder Ø', `${fmt(stats.diameter)} mm`],
    ['height', `${fmt(stats.heightMM, 0)} mm`],
    ['circumference', `${fmt(stats.circumference)} mm`],
    ['cells', fmt(stats.cells, 0)],
  ];
  if (pieces) {
    rows.push(
      ['wall ribbon', `${fmt(pieces.totalOuterLength / 1000, 2)} m`],
      ['folds', fmt(pieces.foldsPrinted, 0)],
      ['wall pieces', `${pieces.pieces.length} on ${pieces.pageCount} pages`, pieces.pageCount > 30],
    );
  } else {
    rows.push(['wall pieces', 'wall too tall for radius', true]);
  }
  rows.push(['template tiles', `${tiles.pages.length} pages (${tiles.ncol}×${tiles.nrow})`, tiles.pages.length > 30]);
  els.specs.innerHTML = rows
    .map(([k, v, warn]) => `<dt>${k}</dt><dd${warn ? ' class="warn"' : ''}>${v}</dd>`)
    .join('');
  els.dlStrips.disabled = !pieces;
  els.dlStripsSub.textContent = pieces
    ? `— ${pieces.pieces.length} pieces · ${pieces.pageCount + 1} pages A4`
    : `— wall height must be < radius (${fmt(stats.radius)} mm)`;
  els.dlTilesSub.textContent = `— ${tiles.pages.length + 1} pages A4 · tape ${tiles.ncol}×${tiles.nrow}`;
}

function rebuild() {
  const p = readParams();
  state.params = p;
  const t0 = performance.now();
  state.cycle = generateCycle(p.cols, p.rows, { seed: p.seed, tree: p.tree });
  const tGen = performance.now() - t0;
  const [ok, msg] = verifyCycle(state.cycle);
  els.pathNote.textContent = ok
    ? `cycle ok — ${p.cols * p.rows} cells, generated in ${tGen.toFixed(1)} ms`
    : `INVALID CYCLE: ${msg}`;

  state.stats = { ...computeStats(p), seed: p.seed, tree: p.tree };
  state.sheet = buildSheet(state.cycle, { cellW: p.cellW, cellH: p.cellH });
  try {
    state.pieces = buildPieces(state.cycle, { cellW: p.cellW, cellH: p.cellH, wallHeight: p.wallHeight });
  } catch (err) {
    state.pieces = null; // wall height >= cylinder radius
  }
  state.tiles = buildTiles(state.sheet);

  const panelMode = p.build === 'panels';
  els.wallField.hidden = panelMode;
  els.panelFields.hidden = !panelMode;
  els.paperOut.hidden = panelMode;
  els.panelOut.hidden = !panelMode;
  state.panelBuild = null;
  state.panelTiles = null;
  state.panelError = null;
  if (panelMode) {
    try {
      state.panelBuild = buildPanels(state.cycle, {
        cellW: p.cellW, cellH: p.cellH, panels: p.panels,
        inset: p.inset, strip: p.strip, stock: p.stock,
      });
      state.panelTiles = buildPanelTiles(state.panelBuild);
    } catch (err) {
      state.panelError = err.message;
    }
  }

  const tMesh = panelMode && state.panelBuild
    ? viewer.updatePanels(state.panelBuild)
    : viewer.update(state.cycle, p);
  flat.update(state.sheet, state.stats, panelMode ? state.panelBuild : null);
  renderSpecs();
  const size = panelMode && state.panelBuild
    ? `${p.panels} panels · ${fmt(state.panelBuild.acrossFlats, 0)} across flats`
    : `Ø${fmt(state.stats.diameter, 0)}`;
  els.readout.textContent =
    `${p.cols}×${p.rows} · ${size} × ${fmt(state.stats.heightMM, 0)} mm · ` +
    `seed ${p.seed} · gen ${tGen.toFixed(1)} ms · mesh ${tMesh.toFixed(0)} ms`;
}

let pending = null;
function scheduleRebuild() {
  clearTimeout(pending);
  pending = setTimeout(rebuild, 200);
}

for (const el of [els.cols, els.rows, els.seed, els.tree, els.cellW, els.cellH, els.wall,
  els.build, els.panels, els.inset, els.strip, els.stock]) {
  el.addEventListener('input', scheduleRebuild);
}

els.regen.addEventListener('click', () => {
  els.seed.value = Math.floor(Math.random() * 1e6);
  rebuild();
});

async function download(button, make, suffix) {
  const p = state.params;
  button.disabled = true;
  els.status.textContent = 'rendering pdf…';
  await new Promise((r) => setTimeout(r, 30)); // let the UI paint
  try {
    const t0 = performance.now();
    const doc = make();
    doc.save(`lamp_${p.cols}x${p.rows}_seed${p.seed}_${suffix}.pdf`);
    els.status.textContent = `${suffix} pdf rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  } catch (err) {
    els.status.textContent = `pdf failed: ${err.message}`;
    throw err;
  } finally {
    button.disabled = false;
  }
}

els.dlStrips.addEventListener('click', () =>
  download(els.dlStrips, () => makePiecesPDF(state.pieces, state.stats), 'pieces'));
els.dlTiles.addEventListener('click', () =>
  download(els.dlTiles, () => makeTilesPDF(state.tiles, state.sheet, state.stats), 'path'));
els.dlPanels.addEventListener('click', () =>
  download(els.dlPanels, () => makePanelsPDF(state.panelBuild, state.panelTiles, state.stats), 'panels'));

rebuild();
