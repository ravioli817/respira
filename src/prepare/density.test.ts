import { describe, expect, it } from "vitest";
import { decodePenData } from "../formats/pen/decoder";
import { encodeStitchPosition } from "../formats/pen/encoder";
import { analyzeDensity } from "./density";
function data(rows: number[][]) {
  return decodePenData(
    new Uint8Array(
      rows.flatMap(([x, y, xFlags = 0, yFlags = 0]) => {
        const bytes = encodeStitchPosition(x, y);
        bytes[0] |= xFlags;
        bytes[2] |= yFlags;
        return bytes;
      }),
    ),
  );
}
describe("density from final PEN commands", () => {
  it("counts penetrations, retains repeats/locks and excludes jumps, cuts and color stops", () => {
    const result = analyzeDensity(
      data([
        [0, 0],
        [0, 0],
        [1, 0],
        [50, 50, 0, 1],
        [50, 50, 0, 2],
        [50, 50, 3, 2],
        [0, 0],
        [1, 1, 5],
        [0, 0],
      ]),
    );
    expect(result.total).toBe(5); // stops at DATA_END, ignoring trailing bytes
    expect(result.shortSegments).toBe(3);
    expect(result.repeatedPoints).toBe(1);
    expect(result.cells[0].blocks).toEqual([0, 1]);
    expect(result.peak).toBe(1.25);
  });
  it("normalizes density by area and supports individual color blocks", () => {
    const d = data([
      [0, 0],
      [0, 0, 3, 2],
      [1, 0],
      [2, 0, 5],
    ]);
    expect(analyzeDensity(d, { cellMm: 1 }).peak).toBe(3);
    expect(analyzeDensity(d, { cellMm: 2 }).peak).toBe(0.75);
    expect(analyzeDensity(d, { cellMm: 5 }).peak).toBe(0.12);
    expect(analyzeDensity(d, { block: 1 }).total).toBe(2);
    expect(analyzeDensity(d, { block: 0 }).total).toBe(1);
  });
  it("uses the prepared placement, including negative coordinates and cell boundaries", () => {
    const d = data([
      [-1, -1],
      [0, 0],
      [20, 20, 5],
    ]);
    const result = analyzeDensity(d, { cellMm: 2, shiftX: 10, shiftY: -10 });
    expect(result.cells.map((c) => [c.x, c.y])).toEqual([
      [8, -12],
      [10, -10],
      [12, -8],
    ]);
    expect(() => analyzeDensity(d, { cellMm: 0 })).toThrow();
  });
});
