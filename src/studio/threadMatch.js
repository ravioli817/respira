// Choosing threads for the colours found in a picture.
//
// The machine's palette has 63 threads, and the nearest one by plain RGB distance is very often a
// gray: a photo's colours are muted to begin with and get more so when an area is averaged. So the
// match is made the way an eye would judge it. Lightness is compared on the CIE L* scale (where
// near-black is black, not dark brown), hue counts for more than how strong the colour is (a pale
// blue goes to a blue thread before a lilac or a gray one). Automatic regions get distinct
// threads, and manually assigned threads are reserved for their regions.

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
/** Added distance for a thread whose tint points another way round the colour wheel. */
var WRONG_HUE = 0.08;
/** Two tints count as the same up to 40 degrees apart, and as plainly different from 80. */
var HUE_SAME = Math.cos(40 * Math.PI / 180), HUE_OTHER = Math.cos(80 * Math.PI / 180);
/**
 * An averaged picture colour is a little duller than the picture looks, so it is strengthened by this
 * much before matching. (A stronger "Vivid" setting was tried as a switch and taken out: it turned
 * skin into Tangerine and khaki into Pumpkin, and one way of matching is easier to trust than two.)
 */
var BOOST = 1.15;

/** How far a thread is from a picture colour; smaller is closer. */
export function threadDistance(rgb, thread) {
  var p = perceptual(rgb[0], rgb[1], rgb[2]), t = perceptual(thread[0], thread[1], thread[2]);
  var pc = Math.hypot(p[1], p[2]), tc = Math.hypot(t[1], t[2]);
  // A colour with no tint at all is left alone: boosting it would only amplify noise.
  var boost = pc < 0.006 ? 1 : BOOST;
  var a = p[1] * boost, b = p[2] * boost; pc *= boost;
  var dl = p[0] - t[0], dc = pc - tc;
  var dh2 = Math.max(0, (a - t[1]) * (a - t[1]) + (b - t[2]) * (b - t[2]) - dc * dc);
  var d = Math.sqrt(dl * dl + CHROMA_WEIGHT * dc * dc + HUE_WEIGHT * dh2);
  if (tc < NEUTRAL && pc > 0.03) d += WRONG_KIND;
  if (pc < 0.012 && tc > 0.05) d += WRONG_KIND;
  // Both have a tint. Where the tints point different ways, agreeing in lightness is not enough:
  // without this, dark brown hair went to Peacock Blue (a teal) ahead of Dark Gray and Dark Brown,
  // because two weak tints are never far apart however opposite they are.
  if (pc > NEUTRAL && tc > NEUTRAL) {
    var cos = (a * t[1] + b * t[2]) / (pc * tc);
    d += WRONG_HUE * Math.min(1, Math.max(0, (HUE_SAME - cos) / (HUE_SAME - HUE_OTHER)));
  }
  return d;
}

/** Thread numbers from the palette, nearest first. Entry 0 and "Applique" (64) are not threads. */
export function rankThreads(palette, rgb) {
  var ranked = [];
  for (var i = 1; i < palette.length; i++) {
    if (i === 64) continue;
    ranked.push([i, threadDistance(rgb, palette[i])]);
  }
  ranked.sort(function (x, y) { return x[1] - y[1]; });
  return ranked;
}

/** One distinct automatic thread per picture region, largest first.
 * Manually selected threads can be reserved so automatic rows do not reuse them. */
export function assignThreads(palette, colors, reserved = []) {
  var order = colors.map(function (c, i) { return i; }).sort(function (x, y) { return (colors[y].area || 0) - (colors[x].area || 0); });
  var taken = new Set(reserved), result = new Array(colors.length);
  order.forEach(function (index) {
    var ranked = rankThreads(palette, colors[index].rgb);
    var pick = ranked.find(function(candidate){ return !taken.has(candidate[0]); });
    if(!pick) throw new Error('There are more picture colors than available threads.');
    taken.add(pick[0]); result[index] = pick[0];
  });
  return result;
}
