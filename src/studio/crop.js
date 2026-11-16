// Cropping a picture before it is turned into stitches.
// A crop is { x, y, w, h } in fractions of the picture (0 to 1), so it does not depend on how the
// picture happens to be scaled on screen or stored.

export const FULL_CROP = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
/** The box cannot be made smaller than this share of the picture's width or height. */
export const MIN_CROP = 0.08;

export function isFullCrop(crop) {
  return !crop || (crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999);
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/**
 * The crop after dragging a corner ("nw", "ne", "sw", "se") or the whole box ("move") by dx, dy,
 * in fractions of the picture. The box stays inside the picture and keeps a minimum size; the
 * corner opposite the one being dragged stays where it is.
 */
export function dragCrop(crop, handle, dx, dy) {
  if (handle === 'move') {
    return { x: clamp(crop.x + dx, 0, 1 - crop.w), y: clamp(crop.y + dy, 0, 1 - crop.h), w: crop.w, h: crop.h };
  }
  var left = crop.x, top = crop.y, right = crop.x + crop.w, bottom = crop.y + crop.h;
  if (handle.indexOf('w') >= 0) left = clamp(left + dx, 0, right - MIN_CROP);
  else right = clamp(right + dx, left + MIN_CROP, 1);
  if (handle.indexOf('n') >= 0) top = clamp(top + dy, 0, bottom - MIN_CROP);
  else bottom = clamp(bottom + dy, top + MIN_CROP, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** The crop in whole pixels of a picture `width` by `height`: { sx, sy, sw, sh }. */
export function cropPixels(crop, width, height) {
  if (isFullCrop(crop)) return { sx: 0, sy: 0, sw: width, sh: height };
  var sx = clamp(Math.round(crop.x * width), 0, width - 1), sy = clamp(Math.round(crop.y * height), 0, height - 1);
  return { sx: sx, sy: sy, sw: clamp(Math.round(crop.w * width), 1, width - sx), sh: clamp(Math.round(crop.h * height), 1, height - sy) };
}
