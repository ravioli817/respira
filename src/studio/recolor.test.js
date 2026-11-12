import { expect, it } from "vitest";
import { drawingColors, recolorDrawing } from "./recolor.js";
it("recolors all existing fills and strokes without altering geometry, background or the source", () => {
  const original = {
    labels: new Uint8Array([0, 5, 20, 5]),
    order: [5, 20],
    strokes: [
      {
        kind: "run",
        color: 20,
        pts: [
          [1, 2, 0],
          [3, 4, 0],
        ],
      },
    ],
    color: 2,
  };
  const result = recolorDrawing(original, 2);
  expect([...result.labels]).toEqual([0, 2, 2, 2]);
  expect(result.order).toEqual([2]);
  expect(result.strokes[0].color).toBe(2);
  expect(result.strokes[0].pts).toEqual(original.strokes[0].pts);
  expect([...original.labels]).toEqual([0, 5, 20, 5]);
  expect(original.strokes[0].color).toBe(20);
  expect(drawingColors(result)).toEqual([2]);
});
it("replaces only the requested source color and merges its fill order", () => {
  const original = {
    labels: new Uint8Array([0, 5, 20]),
    order: [5, 20],
    strokes: [
      { kind: "satin", color: 5, pts: [[1, 1, 3]] },
      { kind: "run", color: 20, pts: [[2, 2, 0]] },
    ],
    color: 37,
  };
  const result = recolorDrawing(original, 20, 5);
  expect([...result.labels]).toEqual([0, 20, 20]);
  expect(result.order).toEqual([20]);
  expect(result.strokes.map((s) => s.color)).toEqual([20, 20]);
  expect(() => recolorDrawing(original, 0)).toThrow();
});
