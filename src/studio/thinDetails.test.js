import { describe, expect, it } from "vitest";
import { foldThin, thinRadius } from "./thinDetails.js";

const W = 60,
  H = 40;
/** A grid of labels painted from rectangles: [x0, y0, x1, y1, label], later ones on top. */
function grid(...rects) {
  const lab = new Uint8Array(W * H);
  for (const [x0, y0, x1, y1, label] of rects)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) lab[y * W + x] = label;
  return lab;
}
const count = (lab, label) => lab.reduce((n, v) => n + (v === label), 0);
const at = (lab, x, y) => lab[y * W + x];
const mirrored = (lab) => {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) out[y * W + x] = lab[y * W + (W - 1 - x)];
  return out;
};

describe("folding parts too thin to stitch into the colour beside them", () => {
  it("measures thin at the size the layer is shown at", () => {
    // 1.2 mm is six cells of 0.2 mm; an opening by 3 loses parts up to six cells wide.
    expect(thinRadius(1)).toBe(3);
    // Shown at half size, twice as many of the picture's cells make 1.2 mm.
    expect(thinRadius(0.5)).toBe(6);
    expect(thinRadius(2)).toBe(2);
    expect(thinRadius(0)).toBe(3);
    expect(thinRadius(0.01)).toBe(15);
  });

  it("returns the labels untouched when nothing is thin", () => {
    const lab = grid([5, 5, 30, 35, 1], [30, 5, 55, 35, 2]);
    expect(foldThin(lab, W, H, 3)).toBe(lab);
  });

  it("shares a thin band between the two colours it lies between", () => {
    // Colour 2 is a band four cells wide between solid 1 and solid 3.
    const lab = grid([5, 5, 28, 35, 1], [28, 5, 32, 35, 2], [32, 5, 55, 35, 3]);
    const out = foldThin(lab, W, H, 3);
    expect(count(out, 2)).toBe(0);
    expect(at(out, 28, 20)).toBe(1);
    expect(at(out, 29, 20)).toBe(1);
    expect(at(out, 30, 20)).toBe(3);
    expect(at(out, 31, 20)).toBe(3);
    // Nothing is lost to bare fabric and nothing grows onto it.
    expect(count(out, 0)).toBe(count(lab, 0));
    expect(lab[20 * W + 29]).toBe(2);
  });

  it("gives a thin fringe round a shape to the shape, not to the fabric", () => {
    // A solid square of 1 with a two-cell rim of 2 all round it, on bare fabric.
    const lab = grid([10, 8, 40, 32, 2], [12, 10, 38, 30, 1]);
    const out = foldThin(lab, W, H, 3);
    expect(count(out, 2)).toBe(0);
    expect(count(out, 1)).toBe(30 * 24);
    expect(count(out, 0)).toBe(count(lab, 0));
  });

  it("trims a thin finger of one colour that reaches into another", () => {
    // Solid 1 on the left with a finger three cells wide reaching far into solid 2.
    const lab = grid([5, 5, 25, 35, 1], [25, 5, 55, 35, 2], [25, 19, 45, 22, 1]);
    const out = foldThin(lab, W, H, 3);
    expect(at(out, 40, 20)).toBe(2);
    expect(at(out, 30, 20)).toBe(2);
    // The solid part of 1 is as it was.
    expect(at(out, 15, 20)).toBe(1);
  });

  it("keeps a thin part that touches no other colour", () => {
    // A line three cells wide on bare fabric: folding it away would delete it.
    const lab = grid([10, 18, 50, 21, 4]);
    const out = foldThin(lab, W, H, 3);
    expect(Array.from(out)).toEqual(Array.from(lab));
  });

  it("recolours only the foot of a whisker, not its length", () => {
    // Solid 1 with a whisker of 2, two cells wide, running off over bare fabric.
    const lab = grid([5, 10, 25, 30, 1], [25, 19, 55, 21, 2]);
    const out = foldThin(lab, W, H, 3);
    expect(at(out, 25, 19)).toBe(1);
    expect(at(out, 40, 19)).toBe(2);
    expect(at(out, 54, 20)).toBe(2);
    expect(count(out, 2)).toBeGreaterThan(40);
  });

  it("gives the same result whichever way round the picture is", () => {
    const lab = grid(
      [4, 4, 26, 36, 1],
      [26, 4, 31, 36, 2],
      [31, 4, 56, 36, 3],
      [31, 18, 48, 21, 1],
      [8, 30, 22, 33, 3],
    );
    expect(Array.from(foldThin(mirrored(lab), W, H, 3))).toEqual(
      Array.from(mirrored(foldThin(lab, W, H, 3))),
    );
  });
});
