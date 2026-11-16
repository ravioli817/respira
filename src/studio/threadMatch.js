// Choosing threads for the colours found in a picture.
//
// The machine's palette has 63 threads, and the nearest one by plain RGB distance is very often a
// gray: a photo's colours are muted to begin with and get more so when an area is averaged. So the
// match is made the way an eye would judge it. Lightness is compared on the CIE L* scale (where
// near-black is black, not dark brown), hue counts for more than how strong the colour is (a pale
// blue goes to a blue thread before a lilac or a gray one), and two areas of a picture are not
// given the same thread while another thread suits one of them nearly as well.

function linear(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }

/** [lightness 0..1 (CIE L* / 100), a, b (OKLab)] for an sRGB colour. */
export function perceptual(r, g, b) {
  r = linear(r); g = linear(g); b = linear(b);
  var y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y) / 100,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}

/** Below this much colour a thread counts as a gray. */
var NEUTRAL = 0.02;
/** A difference in hue counts for more than one in lightness; so, a little, does strength of colour. */
var HUE_WEIGHT = 2.5, CHROMA_WEIGHT = 1.5;
/** Added distance for giving a coloured area a gray thread, or a gray area a coloured one. */
var WRONG_KIND = 0.08;
/** An averaged picture colour is duller than the picture looks; "Vivid" strengthens it much more. */
var TRUE_BOOST = 1.15, VIVID_BOOST = 2;

/**
 * How far a thread is from a picture colour; smaller is closer. `vivid` strengthens the picture's
 * colour first, for photos whose muted tones would otherwise all land on grays.
 */
export function threadDistance(rgb, thread, vivid) {
  var p = perceptual(rgb[0], rgb[1], rgb[2]), t = perceptual(thread[0], thread[1], thread[2]);
  var pc = Math.hypot(p[1], p[2]), tc = Math.hypot(t[1], t[2]);
  // A colour with no tint at all is left alone: boosting it would only amplify noise.
  var boost = pc < 0.006 ? 1 : vivid ? VIVID_BOOST : TRUE_BOOST;
  var a = p[1] * boost, b = p[2] * boost; pc *= boost;
  var dl = p[0] - t[0], dc = pc - tc;
  var dh2 = Math.max(0, (a - t[1]) * (a - t[1]) + (b - t[2]) * (b - t[2]) - dc * dc);
  var d = Math.sqrt(dl * dl + CHROMA_WEIGHT * dc * dc + HUE_WEIGHT * dh2);
  if (tc < NEUTRAL && pc > 0.03) d += WRONG_KIND;
  if (pc < 0.012 && tc > 0.05) d += WRONG_KIND;
  return d;
}

/** Thread numbers from the palette, nearest first. Entry 0 and "Applique" (64) are not threads. */
export function rankThreads(palette, rgb, vivid) {
  var ranked = [];
  for (var i = 1; i < palette.length; i++) {
    if (i === 64) continue;
    ranked.push([i, threadDistance(rgb, palette[i], vivid)]);
  }
  ranked.sort(function (x, y) { return x[1] - y[1]; });
  return ranked;
}

/**
 * One thread for each picture colour, largest area first. A colour takes its nearest thread unless a
 * larger area already has it and another thread is nearly as close; then it takes that one, so two
 * areas of a picture stay two colours in the stitching.
 */
export function assignThreads(palette, colors, vivid) {
  var order = colors.map(function (c, i) { return i; }).sort(function (x, y) { return (colors[y].area || 0) - (colors[x].area || 0); });
  var taken = {}, result = new Array(colors.length);
  order.forEach(function (index) {
    var ranked = rankThreads(palette, colors[index].rgb, vivid), best = ranked[0];
    var pick = best;
    if (taken[best[0]]) {
      // "Nearly as close": within half as far again, or a small step, of the nearest thread.
      var limit = Math.max(best[1] * 1.5, best[1] + 0.035);
      for (var k = 1; k < ranked.length && ranked[k][1] <= limit; k++) {
        if (!taken[ranked[k][0]]) { pick = ranked[k]; break; }
      }
    }
    taken[pick[0]] = true;
    result[index] = pick[0];
  });
  return result;
}
