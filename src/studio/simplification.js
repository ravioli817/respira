import { StitchEngine as E } from './engine.js';
import { threadDistance } from './threadMatch.js';
import { encodeStitchesToPen } from '../formats/pen/encoder';
import { decodePenData } from '../formats/pen/decoder';
import { playbackStats } from '../prepare/playback';

/**
 * What every design gets, with no setting: fill hidden under a later fill is not stitched, the same
 * thread is stitched together where layers do not overlap, and short moves run under fills still to
 * come. These were choices in a "Simplify design" dialog; each only ever saves stitching, so they are
 * simply done. (Leaving out small bits of fill and capping the number of colors were in that dialog
 * too. They change the artwork itself, so they are not done here: a picture has Clean up specks and
 * its Colors slider for that.)
 */
export const automaticSavings = () => ({ removeCovered: true, overlapMm: 0.6, minAreaMm2: 0, maxColors: 0, hiddenTravel: true, optimizeOrder: true });

export const simplificationDefaults = () => ({ removeCovered: false, overlapMm: 0.6, minAreaMm2: 0, maxColors: 0, hiddenTravel: false, optimizeOrder: false });

// Connected components are measured at final hoop size, before colors are combined.
// Four-neighbor connectivity avoids treating diagonally touching islands as a solid fill.
function cleanIslands(labels, minArea) {
  if (!minArea) return 0;
  const seen = new Uint8Array(labels.length), queue = new Int32Array(labels.length);
  let removed = 0;
  for (let seed = 0; seed < labels.length; seed++) {
    if (!labels[seed] || seen[seed]) continue;
    const color = labels[seed]; let head = 0, end = 1;
    queue[0] = seed; seen[seed] = 1;
    while (head < end) {
      const p = queue[head++], x = p % E.GRID;
      for (const q of [x ? p-1 : -1, x < E.GRID-1 ? p+1 : -1, p-E.GRID, p+E.GRID]) {
        if (q >= 0 && q < labels.length && !seen[q] && labels[q] === color) { seen[q] = 1; queue[end++] = q; }
      }
    }
    if (end * E.RES * E.RES < minArea - 1e-9) {
      for (let i = 0; i < end; i++) labels[queue[i]] = 0;
      removed++;
    }
  }
  return removed;
}

// Merge the closest pair into the more-used EXISTING thread. No new shade or sewing order.
function colorMap(parts, limit) {
  const weights = new Map();
  const add = (c, n) => { if (c) weights.set(c, (weights.get(c) || 0) + n); };
  for (const {design} of parts) {
    if (design.rawStitches) continue;
    for (const c of design.labels || []) add(c, E.RES * E.RES);
    for (const line of [...(design.lines || []), ...(design.paths || [])]) {
      for (let i = 1; i < line.pts.length; i++) {
        const a = line.pts[i-1], b = line.pts[i];
        add(line.color, Math.hypot(a[0]-b[0], a[1]-b[1]) * (b[2] || 0.4));
      }
    }
  }
  const map = new Map([...weights.keys()].map(c => [c,c]));
  while (limit && weights.size > limit) {
    const colors = [...weights.keys()].sort((a,b) => a-b);
    let pair, distance = Infinity;
    for (let i = 0; i < colors.length; i++) for (let j = i+1; j < colors.length; j++) {
      const d = threadDistance(E.PEC[colors[i]], E.PEC[colors[j]]);
      if (d < distance) { distance = d; pair = [colors[i],colors[j]]; }
    }
    let [keep, drop] = pair;
    if (weights.get(drop) > weights.get(keep)) [keep,drop] = [drop,keep];
    for (const [c, to] of map) if (to === drop) map.set(c,keep);
    weights.set(keep,weights.get(keep)+weights.get(drop)); weights.delete(drop);
  }
  return map;
}

/** Derived geometry only. Source artwork, text, manual cuts and imported stitch files stay intact. */
export function simplifyParts(input, options = {}) {
  const o = {...simplificationDefaults(), ...options};
  if (!o.removeCovered && !o.minAreaMm2 && !o.maxColors) return {parts:input.filter(p=>p.layer.visible!==false),issues:[]};
  const issues = [];
  const parts = input.filter(p => p.layer.visible !== false).map(p => ({...p, design:p.design.rawStitches ? p.design : {...p.design, labels:p.design.labels?.slice()}}));
  for (const p of parts) {
    // Never delete letter details, even when decorative text has a raster fill.
    const n = !p.design.rawStitches && p.layer.kind !== 'text' && p.design.labels ? cleanIslands(p.design.labels, o.minAreaMm2) : 0;
    if (n) issues.push({layerId:p.layer.id, message:`${p.layer.name}: ${n} tiny ${n===1?'bit of fill is':'bits of fill are'} left out. Open Simplify design to bring ${n===1?'it':'them'} back.`, action:'simplify'});
  }
  if (o.removeCovered) {
    // Use only retained, later fill masks. Lines, satin lettering and PES cannot prove opaque cover.
    // Erosion leaves at least the chosen margin at every outer edge and hole (0.2 mm grid).
    const cover = new Uint8Array(E.GRID * E.GRID);
    for (let i = parts.length-1; i >= 0; i--) {
      const p = parts[i], d = p.design;
      if (d.rawStitches || !d.labels) continue;
      const inside = E.erode(cover,E.GRID,E.GRID,Math.ceil(o.overlapMm/E.RES));
      let removed = 0, remaining = 0;
      for (let j = 0; j < d.labels.length; j++) {
        if (d.labels[j] && inside[j]) { d.labels[j] = 0; removed++; }
        if (d.labels[j]) { cover[j] = 1; remaining++; }
      }
      // Leaving out what is hidden is the normal case and needs no notice. A layer with nothing left does.
      if (removed && !remaining) issues.push({layerId:p.layer.id, message:`${p.layer.name}: all of its fill is hidden under another fill, so it is not stitched. Move it later in Layers to stitch it on top.`, action:'settings'});
    }
  }
  const map = o.maxColors ? colorMap(parts, o.maxColors) : new Map();
  if (o.maxColors) for (const p of parts) {
    const d = p.design;
    if (d.rawStitches) continue;
    d.labels = d.labels?.map(c => map.get(c) || c);
    d.order = [...new Set((d.order || []).map(c => map.get(c) || c))];
    for (const key of ['lines','paths']) d[key] = (d[key] || []).map(line => ({...line, color:map.get(line.color) || line.color}));
  }
  return {parts, issues};
}

/** Count the same encoded commands as Place playback, including machine lock stitches. */
export function sewingFigures(plan) {
  const out = E.toStream(plan);
  if (!out.colors.length) return {threads:0, changes:0, stitches:0, cuts:0, minutes:0};
  const encoded = encodeStitchesToPen(E.toRespiraStitches(out.stream));
  const st = playbackStats(decodePenData(new Uint8Array(encoded.penBytes), encoded.trimStops));
  return {threads:new Set(out.colors).size, changes:out.colors.length-1, stitches:st.needlePoints, cuts:st.cuts, minutes:st.needlePoints/400};
}
