import { describe, it, expect } from "vitest";
import { StitchEngine } from "./engine.js";
import { studioDesignToPattern } from "./toPattern";
import { encodeStitchesToPen } from "../formats/pen/encoder";
import { MOVE } from "../formats/import/constants";
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

  it("never repeats the previous point", () => {
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

  it("refuses an empty design", () => {
    expect(() =>
      studioDesignToPattern({ name: "empty", stitches: [], threads: [] }),
    ).toThrow();
  });
});
