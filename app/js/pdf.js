// Renders the layouts from geometry.js into downloadable PDFs via jsPDF.
// All coordinates arrive in mm; jsPDF documents are created in mm units so
// templates print at true scale (print at 100% / "actual size").

import { A4 } from './geometry.js';

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

// ─────────────────── wall strips PDF ───────────────────
export function makeStripsPDF(stripData, stats) {
  const JsPDF = getJsPDF();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { strips, pages, wallHeight, tab, margin, gap, totalLength } = stripData;

  // cover / assembly sheet
  header(doc, 'HAMILTONIAN LAMP — WALL STRIPS', 'cut, fold at the marks, join tabs in order');
  let y = specBlock(doc, stats, 14, 38);
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const notes = [
    `ribbon: ${(totalLength / 1000).toFixed(2)} m total -> ${strips.length} strips on ${pages.length} sheets`,
    '',
    'PRINT AT 100% SCALE (no "fit to page").',
    'Cut each strip on the solid outline. Fold 90 deg at each dashed line:',
    `  tick above the strip + blue  = path turns LEFT`,
    `  tick below the strip + red   = path turns RIGHT`,
    '(directions as drawn on the unrolled path template, walking left to right)',
    `Glue the hatched ${tab} mm tab under the start of the next strip.`,
    `Strip ${String(strips.length).padStart(3, '0')} closes the loop: its tab glues under strip 001.`,
    'Transfer the path template onto the shade paper, then stand the folded',
    'ribbon on the path line and glue, working around the cylinder.',
  ];
  for (const line of notes) {
    y += 5;
    doc.text(line, 14, y);
  }

  // strip pages
  for (const page of pages) {
    doc.addPage('a4', 'landscape');
    let rowY = margin;
    for (const idx of page.strips) {
      const s = strips[idx - 1];
      const x0 = margin;
      const label = `S${String(s.index).padStart(3, '0')}`;
      const next = s.index === strips.length ? 'S001' : `S${String(s.index + 1).padStart(3, '0')}`;

      // strip number above the strip
      doc.setFont('courier', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...GREY);
      doc.text(`${label}  ->  joins ${next}`, x0, rowY - 0.8);

      // fold marks
      for (const f of s.folds) {
        const fx = x0 + f.pos;
        const left = f.turn === 'L';
        doc.setDrawColor(...(left ? BLUE : RED));
        doc.setLineWidth(0.18);
        doc.setLineDashPattern([1.2, 1.2], 0);
        doc.line(fx, rowY, fx, rowY + wallHeight);
        doc.setLineDashPattern([], 0);
        // direction tick outside the strip
        if (left) doc.line(fx, rowY - 1.6, fx, rowY);
        else doc.line(fx, rowY + wallHeight, fx, rowY + wallHeight + 1.6);
      }

      // glue tab (hatched) after the content
      const tabX = x0 + s.length;
      doc.setDrawColor(...GREY);
      doc.setLineWidth(0.15);
      for (let hx = 0; hx < tab; hx += 2.5) {
        doc.line(tabX + hx, rowY + wallHeight, Math.min(tabX + hx + wallHeight, tabX + tab), rowY + Math.max(0, wallHeight - (tab - hx)));
      }

      // cut outline (content + tab), drawn last so it sits on top
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.3);
      doc.rect(x0, rowY, s.length + tab, wallHeight);
      // tab boundary
      doc.setLineWidth(0.18);
      doc.line(tabX, rowY, tabX, rowY + wallHeight);

      rowY += wallHeight + gap;
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
