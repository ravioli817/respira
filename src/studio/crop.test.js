import { describe, expect, it } from "vitest";
import {
  FULL_CROP,
  MIN_CROP,
  cropPixels,
  dragCrop,
  isFullCrop,
} from "./crop.js";

describe("cropping a picture", () => {
  it("moves the dragged corner and leaves the opposite one where it was", () => {
    const fromBottomRight = dragCrop(FULL_CROP, "se", -0.25, -0.5);
    expect(fromBottomRight).toEqual({ x: 0, y: 0, w: 0.75, h: 0.5 });
    const fromTopLeft = dragCrop(fromBottomRight, "nw", 0.25, 0.1);
    expect(fromTopLeft.x).toBeCloseTo(0.25);
    expect(fromTopLeft.y).toBeCloseTo(0.1);
    expect(fromTopLeft.x + fromTopLeft.w).toBeCloseTo(0.75);
    expect(fromTopLeft.y + fromTopLeft.h).toBeCloseTo(0.5);
  });

  it("keeps the box inside the picture and no smaller than the minimum", () => {
    const tiny = dragCrop(FULL_CROP, "se", -2, -2);
    expect(tiny.w).toBeCloseTo(MIN_CROP);
    expect(tiny.h).toBeCloseTo(MIN_CROP);
    const outside = dragCrop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, "ne", 3, -3);
    expect(outside).toEqual({ x: 0.2, y: 0, w: 0.8, h: 0.7 });
  });

  it("moves the whole box without changing its size, stopping at the edges", () => {
    const box = { x: 0.1, y: 0.1, w: 0.4, h: 0.3 };
    expect(dragCrop(box, "move", 0.2, 0.1)).toEqual({
      x: expect.closeTo(0.3),
      y: expect.closeTo(0.2),
      w: 0.4,
      h: 0.3,
    });
    expect(dragCrop(box, "move", 5, 5)).toEqual({
      x: 0.6,
      y: 0.7,
      w: 0.4,
      h: 0.3,
    });
  });

  it("turns the box into whole pixels of the picture", () => {
    expect(cropPixels(undefined, 400, 300)).toEqual({
      sx: 0,
      sy: 0,
      sw: 400,
      sh: 300,
    });
    expect(cropPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 400, 300)).toEqual({
      sx: 100,
      sy: 150,
      sw: 200,
      sh: 150,
    });
    expect(isFullCrop(FULL_CROP)).toBe(true);
    expect(isFullCrop({ x: 0, y: 0, w: 0.9, h: 1 })).toBe(false);
  });
});
