// The same retained rectangles as the panel PDF, with shared internal edges
// removed. No extra backing sheet, border bands, or joining tabs are invented.
export function paperPathEdges(panel) {
  const lines = new Map();
  const key = n => Math.round(n * 1e8) / 1e8;
  const add = (axis, fixed, start, end) => {
    const id = `${axis}:${key(fixed)}`;
    if (!lines.has(id)) lines.set(id, { axis, fixed: key(fixed), events: new Map() });
    const events = lines.get(id).events;
    for (const n of [start, end]) events.set(key(n), (events.get(key(n)) || 0) + 1);
  };
  for (const { x, y, w, h } of panel.keep) {
    add('h', y, x, x + w);
    add('h', y + h, x, x + w);
    add('v', x, y, y + h);
    add('v', x + w, y, y + h);
  }
  const cuts = [], joins = [];
  for (const { axis, fixed, events } of lines.values()) {
    let inside = false, start;
    for (const [at, count] of [...events].sort((a, b) => a[0] - b[0])) {
      if (count % 2 === 0) continue;
      if (!inside) start = at;
      else {
        const segment = axis === 'h' ? [[start, fixed], [at, fixed]] : [[fixed, start], [fixed, at]];
        const seam = axis === 'v' && (Math.abs(fixed) < 1e-7 || Math.abs(fixed - panel.widthMM) < 1e-7);
        (seam ? joins : cuts).push(segment);
      }
      inside = !inside;
    }
  }
  return { cuts, joins };
}
