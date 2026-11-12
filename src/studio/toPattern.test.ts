import { describe, it, expect } from "vitest";
import { StitchEngine } from "./engine.js";
import { studioDesignToPattern } from "./toPattern";
import { encodeStitchesToPen } from "../formats/pen/encoder";
import { MOVE, TRIM } from "../formats/import/constants";
import type { StudioDesign } from "./studioApp.js";

const { GRID, RES, PEC } = StitchEngine;

/** A filled disc of one thread on the 0.2 mm design grid. */
function disc(
  labels: Uint8Array,
  cx: number,
  cy: number,
  radius: number,
  thread: number,
) {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const dx = (x + 0.5) * RES - cx;
      const dy = (y + 0.5) * RES - cy;
      if (dx * dx + dy * dy <= radius * radius) labels[y * GRID + x] = thread;
    }
  }
}

/** What the Create screen hands over when "Send to Skitch" is tapped. */
function designFrom(
  labels: Uint8Array,
  order: number[],
  lines: Array<{ kind: "satin" | "run"; color: number; pts: number[][] }> = [],
): StudioDesign {
  const plan = StitchEngine.plan({ labels, order, lines }, {});
  const { stream, colors } = StitchEngine.toStream(plan);
  return {
    name: "test",
    stitches: StitchEngine.toRespiraStitches(stream),
    threads: colors.map((c) => ({
      index: c,
      name: PEC[c][3],
      rgb: [PEC[c][0], PEC[c][1], PEC[c][2]] as [number, number, number],
    })),
  };
}

describe("toRespiraStitches", () => {
  const labels = new Uint8Array(GRID * GRID);
  disc(labels, 30, 30, 8, 5);
  disc(labels, 70, 70, 8, 37);
  const design = designFrom(labels, [5, 37]);

  it("starts on a stitch, not a jump, as a PES read by Respira does", () => {
    expect(design.stitches[0][2] & MOVE).toBe(0);
  });

  it("numbers colors from zero in sewing order", () => {
    const colors = [...new Set(design.stitches.map((s) => s[3]))];
    expect(colors).toEqual([0, 1]);
    expect(design.threads.map((t) => t.index)).toEqual([5, 37]);
  });

  it("never repeats the previous point, as a PES read by Respira never does", () => {
    for (let i = 1; i < design.stitches.length; i++) {
      const [x, y] = design.stitches[i];
      const [px, py] = design.stitches[i - 1];
      expect(x === px && y === py).toBe(false);
    }
  });

  it("keeps coordinates in 0.1 mm from the hoop's center", () => {
    const xs = design.stitches.map((s) => s[0]);
    const ys = design.stitches.map((s) => s[1]);
    // discs of radius 8 mm at (30,30) and (70,70) in a 100 mm hoop
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-290);
    expect(Math.max(...xs)).toBeLessThanOrEqual(290);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-290);
    expect(Math.max(...ys)).toBeLessThanOrEqual(290);
  });
});

describe("studioDesignToPattern", () => {
  it("encodes with Respira's own PEN encoder", () => {
    const labels = new Uint8Array(GRID * GRID);
    disc(labels, 50, 50, 10, 5);
    const design = designFrom(labels, [5]);
    const { data } = studioDesignToPattern(design);

    const reference = encodeStitchesToPen(design.stitches);
    expect(Array.from(data.penData)).toEqual(reference.penBytes);
    expect(data.bounds).toEqual(reference.bounds);
    expect(data.penStitches.stitches.length).toBe(data.penData.length / 4);
    expect(data.stitchCount).toBe(design.stitches.length);
  });

  it("reports where the design was drawn, so it is not moved to the middle", () => {
    const labels = new Uint8Array(GRID * GRID);
    disc(labels, 80, 20, 6, 13); // top right of the hoop
    const { data, center } = studioDesignToPattern(designFrom(labels, [13]));

    // (80, 20) mm in the hoop is (+30, -30) mm from its center
    expect(center.x / 10).toBeCloseTo(30, 0);
    expect(center.y / 10).toBeCloseTo(-30, 0);
    expect((data.bounds.maxX - data.bounds.minX) / 10).toBeCloseTo(12, 0);
  });

  it("gives one thread and one color block per color, matched to Brother's catalog", () => {
    const labels = new Uint8Array(GRID * GRID);
    disc(labels, 30, 50, 8, 5); // Red
    disc(labels, 70, 50, 8, 29); // White
    const { data } = studioDesignToPattern(designFrom(labels, [5, 29]));

    expect(data.colorCount).toBe(2);
    expect(data.threads).toHaveLength(2);
    expect(data.penStitches.colorBlocks).toHaveLength(2);
    expect(data.threads[1]).toMatchObject({
      hex: "#F0F0F0",
      brand: "Brother Embroidery",
      catalogNumber: "001",
    });
    expect(data.uniqueColors).toHaveLength(2);
  });

  it("groups repeated colors under one unique color", () => {
    const labels = new Uint8Array(GRID * GRID);
    disc(labels, 30, 50, 8, 5);
    const design = designFrom(
      labels,
      [5],
      [
        {
          kind: "run",
          color: 20,
          pts: [
            [10, 10, 0],
            [40, 10, 0],
          ],
        },
        {
          kind: "run",
          color: 5,
          pts: [
            [10, 90, 0],
            [40, 90, 0],
          ],
        },
      ],
    );
    const { data } = studioDesignToPattern(design);

    expect(data.threads).toHaveLength(3);
    expect(data.uniqueColors).toHaveLength(2);
    expect(data.uniqueColors[0].threadIndices).toEqual([0, 2]);
  });

  /** Two straight lines of one thread, the second starting `gapMm` after the first ends. */
  function twoLines(gapMm: number) {
    return designFrom(
      new Uint8Array(GRID * GRID),
      [],
      [
        {
          kind: "run",
          color: 5,
          pts: [
            [40, 40, 0],
            [50, 40, 0],
          ],
        },
        {
          kind: "run",
          color: 5,
          pts: [
            [50 + gapMm, 40, 0],
            [60 + gapMm, 40, 0],
          ],
        },
      ],
    );
  }
  /** Decoded machine points: position in 0.1 mm plus the jump and cut flags. */
  function penPoints(penData: Uint8Array) {
    const view = new DataView(
      penData.buffer,
      penData.byteOffset,
      penData.byteLength,
    );
    const points = [];
    for (let i = 0; i < penData.length; i += 4) {
      points.push({
        x: view.getInt16(i, true) >> 3,
        y: view.getInt16(i + 2, true) >> 3,
        feed: (penData[i + 2] & 1) === 1,
        cut: (penData[i + 2] & 2) === 2,
      });
    }
    return points;
  }

  it("hands Respira no trim rows: its encoder decides where the thread is cut", () => {
    expect(twoLines(3).stitches.filter((s) => s[2] === TRIM)).toHaveLength(0);
    expect(twoLines(20).stitches.filter((s) => s[2] === TRIM)).toHaveLength(0);
  });

  it("crosses a short same-color gap with a plain jump and no cut", () => {
    const points = penPoints(studioDesignToPattern(twoLines(3)).data.penData);
    expect(points.filter((p) => p.cut)).toHaveLength(0);
    const jumps = points.filter((p) => p.feed);
    expect(jumps).toHaveLength(1);
    // First line ends at x = 0 (hoop centre); the second starts 3 mm on.
    expect(jumps[0].x).toBe(30);
  });

  it("cuts exactly once across a long same-color gap, on the jump itself", () => {
    const points = penPoints(studioDesignToPattern(twoLines(20)).data.penData);
    const cuts = points.filter((p) => p.cut);
    expect(cuts).toHaveLength(1);
    const at = points.indexOf(cuts[0]);
    expect(points[at]).toMatchObject({ x: 200, feed: true, cut: true });
    // Respira ties off with 8 lock stitches before the cut and ties in with 8 after it.
    for (const p of points.slice(at - 8, at)) {
      expect(p.feed || p.cut).toBe(false);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(2);
    }
    for (const p of points.slice(at + 1, at + 9)) {
      expect(p.feed || p.cut).toBe(false);
      expect(Math.abs(p.x - 200)).toBeLessThanOrEqual(2);
    }
  });

  it("keeps a color change when the next color starts at the same point", () => {
    const { STITCH, COLOR_CHANGE, END } = StitchEngine.CMD;
    const stitches = StitchEngine.toRespiraStitches([
      [0, 0, STITCH],
      [10, 0, STITCH],
      [10, 0, COLOR_CHANGE],
      [10, 0, STITCH],
      [20, 0, STITCH],
      [20, 0, END],
    ]);
    // The repeated point goes, as it does when Respira reads a PES; the color index still changes.
    expect(stitches).toEqual([
      [0, 0, 0, 0],
      [10, 0, 0, 0],
      [20, 0, 0, 1],
    ]);
    const { penBytes } = encodeStitchesToPen(stitches);
    expect(
      penBytes.filter((b, i) => i % 4 === 0 && (b & 7) === 3),
    ).toHaveLength(1);
  });

  it("refuses an empty design", () => {
    expect(() =>
      studioDesignToPattern({ name: "empty", stitches: [], threads: [] }),
    ).toThrow();
  });
});
