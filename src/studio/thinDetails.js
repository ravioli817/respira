// Folding the parts of a picture that are too thin to stitch into the colour beside them.
//
// A filled area narrower than about 1.2 mm does not stitch cleanly: there is no room for the rows of
// a fill. Photos are full of such parts (the band where one colour shades into the next, a fringe
// round the edge of a shape), and the picture warning used to leave them for the person to deal with
// by enlarging the picture or using fewer colours. Here each thin part is given to the solid colour
// it touches instead, the way a speck is merged into its surroundings.
//
// What is left alone: a thin part that touches no other colour (a whisker over bare fabric, a line
// drawing). Folding it away would delete it, so it is kept and the warning still speaks up.

import { StitchEngine as E } from './engine.js';

/** Final width, in millimetres, below which a filled part counts as too thin to stitch. */
export var THIN_MM = 1.2;

/**
 * How many grid cells to open each colour by so that parts narrower than THIN_MM are found, for a
 * picture whose layer is shown at `scale` (a picture drawn at half size needs twice the cells).
 * An opening by r loses parts up to 2r cells wide; rounding up errs towards folding a part that is
 * right on the line, so that the warning has nothing left to say about it.
 */
export function thinRadius(scale) {
  var cells = THIN_MM / (E.RES * (scale > 0 ? scale : 1));
  return Math.max(1, Math.min(15, Math.ceil(cells / 2 - 1e-9)));
}

/**
 * @param {Uint8Array} lab one label per cell: 0 is bare fabric, 1 and up are the picture's colours
 * @param {number} r from thinRadius()
 * @returns {Uint8Array} the labels with thin parts folded in (the same array if there were none)
 */
export function foldThin(lab, W, H, r) {
  var n = W * H, thin = new Uint8Array(n), any = false, top = 0, i;
  for (i = 0; i < n; i++) if (lab[i] > top) top = lab[i];
  for (var c = 1; c <= top; c++) {
    var mask = new Uint8Array(n), has = false;
    for (i = 0; i < n; i++) if (lab[i] === c) { mask[i] = 1; has = true; }
    if (!has) continue;
    // What an opening loses is what is too narrow to hold a square of 2r+1 cells.
    var opened = E.dilate(E.erode(mask, W, H, r), W, H, r);
    for (i = 0; i < n; i++) if (mask[i] && !opened[i]) { thin[i] = 1; any = true; }
  }
  if (!any) return lab;

  // Solid cells are settled. Thin cells settle ring by ring, each taking the colour most of its
  // settled neighbours have; a whole ring is decided before any of it counts, so the result does
  // not depend on the order the cells are visited in. Bare fabric never counts as a neighbour.
  var out = lab.slice(), settled = new Uint8Array(n), waiting = [];
  for (i = 0; i < n; i++) { if (thin[i]) waiting.push(i); else if (lab[i]) settled[i] = 1; }
  var votes = new Int32Array(top + 1);
  // A thin part is at most 2r cells across, so r rings from each side meet in the middle; one more
  // for corners. Anything further from a solid colour than that stands on its own and is kept.
  for (var ring = 0; ring <= r && waiting.length; ring++) {
    var taken = [], rest = [];
    for (var w = 0; w < waiting.length; w++) {
      var p = waiting[w], x = p % W, y = (p - x) / W, best = 0, bestN = 0;
      votes.fill(0);
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = x + dx, yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        var q = yy * W + xx;
        if (!settled[q]) continue;
        var v = out[q], count = ++votes[v];
        if (count > bestN || (count === bestN && v < best)) { best = v; bestN = count; }
      }
      if (bestN) taken.push(p, best); else rest.push(p);
    }
    if (!taken.length) break;
    for (var t = 0; t < taken.length; t += 2) { out[taken[t]] = taken[t + 1]; settled[taken[t]] = 1; }
    waiting = rest;
  }
  return out;
}
