import { describe, expect, it } from "vitest";
import { StitchEngine as E } from "./engine.js";
import { parsePes } from "./pesImport.js";

/** A two-thread design written by the app's own PES writer: an L in red, a short bar in black. */
function sampleFile() {
  const plan = E.plan(
    {
      labels: new Uint8Array(E.GRID * E.GRID),
      order: [],
      lines: [
        {
          kind: "run",
          color: 5,
          pts: [
            [20, 20, 0],
            [40, 20, 0],
            [40, 40, 0],
          ],
        },
        {
          kind: "run",
          color: 20,
          pts: [
            [60, 70, 0],
            [80, 70, 0],
          ],
        },
      ],
    },
    {},
  );
  const out = E.toStream(plan);
  return { bytes: E.writePES(out.stream, out.colors, "sample"), plan };
}

describe("reading a .pes file", () => {
  it("gets back the threads, the size and the runs of stitches the writer put in", () => {
    const { bytes } = sampleFile();
    const design = parsePes(new Uint8Array(bytes));
    expect(design.slots).toEqual([5, 20]);
    // The marks span 20..80 mm across and 20..70 mm down; lock stitches add a fraction.
    expect(design.width).toBeGreaterThan(59);
    expect(design.width).toBeLessThan(62);
    expect(design.height).toBeGreaterThan(49);
    expect(design.height).toBeLessThan(52);
    // One run per thread here, each in its own colour stop, in sewing order.
    expect(design.paths.map((p) => p.slot)).toEqual([0, 1]);
    expect(design.stitches).toBeGreaterThan(20);
  });

  it("centres the design in the hoop, wherever the file placed it", () => {
    const design = parsePes(new Uint8Array(sampleFile().bytes));
    const xs = design.paths.flatMap((p) => p.pts.map((q) => q[0]));
    const ys = design.paths.flatMap((p) => p.pts.map((q) => q[1]));
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(50, 1);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(50, 1);
  });

  it("keeps the shape: the red run still turns a right angle", () => {
    const design = parsePes(new Uint8Array(sampleFile().bytes));
    const red = design.paths[0].pts;
    const first = red[0],
      last = red[red.length - 1];
    // Starts at the left end of the top stroke, ends at the bottom of the upright: 20 mm across, 20 mm down.
    expect(Math.abs(last[0] - first[0])).toBeGreaterThan(19);
    expect(Math.abs(last[1] - first[1])).toBeGreaterThan(19);
  });

  it("says plainly when a file is not an embroidery file, or is empty", () => {
    expect(() => parsePes(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
    const text = new TextEncoder().encode("this is just some text, not stitches");
    expect(() => parsePes(text)).toThrow(/not a Brother \.pes file/);
    const empty = new Uint8Array(sampleFile().bytes);
    const pec = empty[8] | (empty[9] << 8) | (empty[10] << 16);
    empty[pec + 532] = 0xff; // end marker where the first stitch should be
    expect(() => parsePes(empty)).toThrow(/no stitches/);
  });
});
