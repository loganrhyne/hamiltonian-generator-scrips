// Renders the layouts from geometry.js into downloadable PDFs via jsPDF.
// All coordinates arrive in mm; jsPDF documents are created in mm units so
// templates print at true scale (print at 100% / "actual size").

import { A4, pieceOutline } from './geometry.js';

function getJsPDF() {
  const lib = globalThis.jspdf;
  if (!lib) throw new Error('jsPDF not loaded');
  return lib.jsPDF;
}

const INK = [20, 24, 28];
const BLUE = [0, 102, 204];
const RED = [204, 32, 32];
const GREY = [130, 140, 150];

function header(doc, title, sub) {
  doc.setFont('courier', 'bold');
  doc.setTextColor(...INK);
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(sub, 14, 26);
}

function specBlock(doc, stats, x, y) {
  const rows = [
    ['grid', `${stats.cols} x ${stats.rows} cells (cols x rows)`],
    ['cell', `${stats.cellW} x ${stats.cellH} mm`],
    ['cylinder', `diameter ${stats.diameter.toFixed(1)} mm x ${stats.heightMM.toFixed(0)} mm tall`],
    ['circumference', `${stats.circumference.toFixed(1)} mm`],
    ['wall height', `${stats.wallHeight} mm`],
    ['seed', `${stats.seed} (${stats.tree})`],
  ];
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  for (let i = 0; i < rows.length; i++) {
    doc.setTextColor(...GREY);
    doc.text(rows[i][0], x, y + i * 5);
    doc.setTextColor(...INK);
    doc.text(rows[i][1], x + 34, y + i * 5);
  }
  return y + rows.length * 5;
}

function polyline(doc, pts, closed = false) {
  for (let i = 0; i + 1 < pts.length; i++) {
    doc.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  }
  if (closed && pts.length > 1) {
    doc.line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]);
  }
}

// ─────────────────── wall pieces PDF ───────────────────
export function makePiecesPDF(pieceData, stats) {
  const JsPDF = getJsPDF();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const {
    pieces, placements, pageCount, totalOuterLength, wallHeight: w,
    tab, margin, R,
  } = pieceData;

  // cover / assembly sheet
  header(doc, 'HAMILTONIAN LAMP — WALL PIECES',
    'curved pieces follow the cylinder: arcs lie flat, rectangles stand tall');
  let y = specBlock(doc, stats, 14, 38);
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const notes = [
    `wall ribbon: ${(totalOuterLength / 1000).toFixed(2)} m along the shade -> ${pieces.length} pieces on ${pageCount} sheets`,
    `horizontal runs are ring arcs (outer radius ${R.toFixed(1)} mm, inner ${(R - w).toFixed(1)} mm);`,
    'vertical runs are straight; the printed shape is the wall unfolded flat.',
    '',
    'PRINT AT 100% SCALE (no "fit to page").',
    'Cut on the solid outline. The edge that traces the drawn path (fold ticks',
    'on its side point AWAY from the piece) glues to the shade; the opposite',
    'edge hangs free toward the bulb.',
    'Fold 90 deg at each dashed line: blue tick past the shade edge = path',
    'turns LEFT on the template; red tick past the free edge = turns RIGHT.',
    `Glue each hatched ${tab} mm tab under the start of the next piece; a`,
    'dashed colored end line means that joint is also a 90 deg corner.',
    `Piece ${String(pieces.length).padStart(3, '0')} closes the loop back onto piece 001.`,
    'Test-fit the first corner against the path template before gluing.',
  ];
  for (const line of notes) {
    y += 5;
    doc.text(line, 14, y);
  }

  // piece pages
  const byPage = new Map();
  for (const pl of placements) {
    if (!byPage.has(pl.page)) byPage.set(pl.page, []);
    byPage.get(pl.page).push(pl);
  }

  for (const [, pls] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    doc.addPage('a4', 'landscape');
    for (const pl of pls) {
      const pc = pieces[pl.piece - 1];
      const ox = margin + pl.x;
      const oy = margin + pl.y;
      const T = (p) => [ox + p[0], oy + p[1]];
      const dirOf = (a) => [Math.cos(a), Math.sin(a)];
      const leftOf = (a) => [Math.cos(a + Math.PI / 2), Math.sin(a + Math.PI / 2)];

      const { outer, inner } = pieceOutline(pc, w);

      // fold lines first (under the outline)
      for (const f of pc.folds) {
        const nl = leftOf(f.ang);
        const p0 = T(f.p);
        const p1 = T([f.p[0] + w * nl[0], f.p[1] + w * nl[1]]);
        const isL = f.turn === 'L';
        doc.setDrawColor(...(isL ? BLUE : RED));
        doc.setLineWidth(0.18);
        doc.setLineDashPattern([1.2, 1.2], 0);
        doc.line(p0[0], p0[1], p1[0], p1[1]);
        doc.setLineDashPattern([], 0);
        if (isL) {
          doc.line(p0[0], p0[1], p0[0] - 1.6 * nl[0], p0[1] - 1.6 * nl[1]);
        } else {
          doc.line(p1[0], p1[1], p1[0] + 1.6 * nl[0], p1[1] + 1.6 * nl[1]);
        }
      }

      // glue tab at the end
      const d = dirOf(pc.end.ang);
      const nl = leftOf(pc.end.ang);
      const e0 = pc.end.p;
      const e1 = [e0[0] + w * nl[0], e0[1] + w * nl[1]];
      const e2 = [e1[0] + tab * d[0], e1[1] + tab * d[1]];
      const e3 = [e0[0] + tab * d[0], e0[1] + tab * d[1]];
      doc.setDrawColor(...GREY);
      doc.setLineWidth(0.15);
      const q = (s, t) => [
        e0[0] + s * tab * d[0] + t * w * nl[0],
        e0[1] + s * tab * d[1] + t * w * nl[1],
      ];
      for (let a = 0; a <= 0.6; a += 0.15) {
        // diagonal hatch in the quad's affine param space
        const A = T(q(a, 0));
        const B = T(q(a + 0.4, 1));
        doc.line(A[0], A[1], B[0], B[1]);
      }
      // tab outline (sides + far end); the band-side edge is the joint line
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.3);
      polyline(doc, [T(e1), T(e2), T(e3), T(e0)]);
      // joint line: dashed + colored when the joint is also a 90° corner
      if (pc.end.joinFold) {
        const isL = pc.end.joinFold === 'L';
        doc.setDrawColor(...(isL ? BLUE : RED));
        doc.setLineWidth(0.18);
        doc.setLineDashPattern([1.2, 1.2], 0);
        doc.line(T(e0)[0], T(e0)[1], T(e1)[0], T(e1)[1]);
        doc.setLineDashPattern([], 0);
      }

      // cut outline: outer edge forward, end cap, inner edge back (closed)
      const boundary = outer.concat([...inner].reverse());
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.3);
      polyline(doc, boundary.map(T), true);

      // label at the start of the piece (travel always starts heading +x)
      const next = pc.index === pieces.length ? 'P001' : `P${String(pc.index + 1).padStart(3, '0')}`;
      doc.setFont('courier', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...GREY);
      const lp = T(pc.start.p);
      doc.text(`P${String(pc.index).padStart(3, '0')} > ${next}`, lp[0] + 0.8, lp[1] - 1);
    }
  }
  return doc;
}

// ─────────────────── tiled path template PDF ───────────────────
export function makeTilesPDF(tileData, sheet, stats) {
  const JsPDF = getJsPDF();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { pages, nrow, ncol, margin, usableW, usableH } = tileData;

  // cover: stats + a scaled overview of the whole unrolled sheet
  header(doc, 'HAMILTONIAN LAMP — PATH TEMPLATE', `tape ${pages.length} tiles (${ncol} across x ${nrow} down) into the full unrolled cylinder`);
  let y = specBlock(doc, stats, 14, 38);
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const notes = [
    'PRINT AT 100% SCALE (no "fit to page").',
    'Trim/overlap tiles at the crop marks; tile labels read R<row>C<col>.',
    'Blue dashed verticals are the cylinder glue seam: both edges meet there.',
    'Tape the tiles, lay the sheet on the shade paper, transfer the path,',
    'then roll and glue the seam.',
  ];
  for (const line of notes) {
    y += 5;
    doc.text(line, 14, y);
  }
  // overview drawing scaled to fit the remaining cover area
  const ovY = y + 8;
  const ovW = A4.w - 28;
  const ovH = A4.h - ovY - 14;
  const k = Math.min(ovW / sheet.widthMM, ovH / sheet.heightMM);
  const ox = 14 + (ovW - sheet.widthMM * k) / 2;
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.15);
  for (let r = 0; r <= nrow; r++) {
    doc.line(ox, ovY + Math.min(r * usableH, sheet.heightMM) * k, ox + sheet.widthMM * k, ovY + Math.min(r * usableH, sheet.heightMM) * k);
  }
  for (let c = 0; c <= ncol; c++) {
    doc.line(ox + Math.min(c * usableW, sheet.widthMM) * k, ovY, ox + Math.min(c * usableW, sheet.widthMM) * k, ovY + sheet.heightMM * k);
  }
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.25);
  for (const s of sheet.segments) {
    doc.line(ox + s.x1 * k, ovY + s.y1 * k, ox + s.x2 * k, ovY + s.y2 * k);
  }

  // tile pages
  for (const page of pages) {
    doc.addPage('a4', 'portrait');
    // path segments (already clipped + page-local)
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.7);
    doc.setLineCap('round');
    for (const s of page.segments) {
      doc.line(s.x1, s.y1, s.x2, s.y2);
    }
    // glue seam edges
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([4, 2], 0);
    for (const seam of page.seams) {
      doc.line(seam.x, margin, seam.x, margin + usableH);
    }
    doc.setLineDashPattern([], 0);
    // crop marks at usable-area corners
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    for (const [cx, cy] of [
      [margin, margin], [margin + usableW, margin],
      [margin, margin + usableH], [margin + usableW, margin + usableH],
    ]) {
      doc.line(cx - 3, cy, cx + 3, cy);
      doc.line(cx, cy - 3, cx, cy + 3);
    }
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`${page.label} of R${nrow}C${ncol}`, margin + 2, margin + 5);
  }
  return doc;
}

// ─────────────────── flat-panel build PDF ───────────────────
const WALNUT = [150, 104, 70];
const CUT = [222, 226, 230];

function panelSpecRows(build, stats) {
  const shape = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 8: 'octagon' }[build.panelCount]
    || `${build.panelCount}-gon`;
  return [
    ['grid', `${stats.cols} x ${stats.rows} cells, ${build.colsPerPanel} cols per panel`],
    ['cell', `${stats.cellW} x ${stats.cellH} mm`],
    ['prism', `${build.panelCount} panels (${shape}), ${build.panelW.toFixed(0)} x ${build.panelH.toFixed(0)} mm each`],
    ['footprint', `${build.acrossFlats.toFixed(1)} mm across flats, ${build.acrossCorners.toFixed(1)} across corners`],
    ['walls', `${build.strip} mm square strip, ${build.inset} mm in from the grid`],
    ['gaps', `${build.gap} mm between side-by-side runs; ${build.clear.toFixed(0)} mm clear channel`],
    ['seed', `${stats.seed} (${stats.tree})`],
  ];
}

export function makePanelsPDF(build, tiles, stats) {
  const JsPDF = getJsPDF();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { pages, margin, usableW, usableH } = tiles;
  const mitre = build.mitre.toFixed(build.mitre % 1 ? 1 : 0);

  header(doc, 'HAMILTONIAN LAMP — FLAT PANELS',
    `${build.panelCount} panels · ${build.strips} strips · ${pages.length} template pages`);
  let y = 38;
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  for (const [k, v] of panelSpecRows(build, stats)) {
    doc.setTextColor(...GREY);
    doc.text(k, 14, y);
    doc.setTextColor(...INK);
    doc.text(v, 48, y);
    y += 5;
  }
  const notes = [
    'PRINT AT 100% SCALE (no "fit to page"). Tape each panel\'s tiles at the',
    'crop marks (labels read P<panel> R<row>C<col>), then lay acetate over it.',
    'Glue a strip on every brown bar, cut to the length its letter gives in the',
    'cut list. Bars at the panel edge are mitred: ' + mitre + ' deg, long point on',
    'the acetate, so the strips meet when the panels close into the prism.',
    'Once the glue sets, cut the grey areas out of the acetate: light passes',
    'straight through them and the path between the walls diffuses it.',
    `Walls face the bulb. Panel P${build.panelCount} closes back onto P1.`,
    `After cutting, the path is ${build.pieces} separate acetate pieces across the panels;`,
    'each one is held where it runs off a panel edge, so join the panels',
    '(or fit a frame) before handling them much.',
  ];
  y += 3;
  for (const line of notes) {
    doc.text(line, 14, y);
    y += 5;
  }

  // cut list, two columns, continuing onto extra pages if needed
  y += 4;
  doc.setFont('courier', 'bold');
  doc.text('CUT LIST', 14, y);
  doc.setFont('courier', 'normal');
  doc.setTextColor(...GREY);
  doc.text(`${(build.totalLength / 1000).toFixed(2)} m of strip · about ${build.sticks} x ${build.stock} mm`
    + ` sticks at ${build.kerf} mm kerf`, 42, y);
  y += 6;
  const colX = [14, 108];
  const lineH = 4.6;
  let col = 0;
  const top = y;
  const endCopy = (g) => (g.mitres === 0 ? 'square' : g.mitres === 1 ? `1 end ${mitre}°` : `both ${mitre}°`)
    .replace('°', ' deg');
  for (const g of build.cutList) {
    if (y > A4.h - 14) {
      col++;
      y = top;
      if (col > 1) {
        doc.addPage('a4', 'portrait');
        col = 0;
        y = 20;
      }
    }
    doc.setTextColor(...WALNUT);
    doc.setFont('courier', 'bold');
    doc.text(g.code.padEnd(3), colX[col], y);
    doc.setFont('courier', 'normal');
    doc.setTextColor(...INK);
    doc.text(`${String(g.count).padStart(3)} x ${g.len.toFixed(1).padStart(6)} mm  ${endCopy(g)}`, colX[col] + 8, y);
    y += lineH;
  }

  // template pages
  for (const page of pages) {
    doc.addPage('a4', 'portrait');
    const x0 = margin;
    const y0 = margin;
    // cut-away areas
    doc.setFillColor(...CUT);
    for (const rc of page.cut) doc.rect(rc.x, rc.y, rc.w, rc.h, 'F');
    // walls
    doc.setFillColor(...WALNUT);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.12);
    for (const rc of page.walls) doc.rect(rc.x, rc.y, rc.w, rc.h, 'FD');
    // cut-list letter on every bar (a bar split across tiles is lettered on each)
    doc.setFont('courier', 'bold');
    doc.setFontSize(Math.min(9, build.strip * 2));
    doc.setTextColor(255, 255, 255);
    for (const rc of page.walls) {
      const long = Math.max(rc.w, rc.h);
      if (long < 7) continue;
      const cx = rc.x + rc.w / 2;
      const cy = rc.y + rc.h / 2;
      doc.text(rc.code, cx, cy, { align: 'center', baseline: 'middle' });
    }
    // panel edges (prism corners)
    doc.setDrawColor(...BLUE);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([4, 2], 0);
    for (const ex of page.edges) doc.line(ex, y0, ex, y0 + page.extentH);
    doc.setLineDashPattern([], 0);
    // crop marks at the usable-area corners
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    for (const [cx, cy] of [
      [x0, y0], [x0 + usableW, y0], [x0, y0 + usableH], [x0 + usableW, y0 + usableH],
    ]) {
      doc.line(cx - 3, cy, cx + 3, cy);
      doc.line(cx, cy - 3, cx, cy + 3);
    }
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`${page.label}  ·  panel ${page.panel} of ${build.panelCount}, tiles ${page.ncol} across x ${page.nrow} down`
      + '  ·  blue dashes = prism corner',
      x0 + 2, A4.h - 3);
  }
  return doc;
}
