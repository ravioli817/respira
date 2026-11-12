import { describe, expect, it } from "vitest";
import {
  composePlans,
  transformPoint,
  transformDesign,
} from "./composition.js";
import { StitchEngine as E } from "./engine.js";
describe("layer composition", () => {
  it("inverts translation, scaling and rotation for drawing input", () => {
    const t = { x: 10, y: -5, scale: 0.7, rotation: 45 },
      p = [30, 60];
    const back = transformPoint(transformPoint(p, t), t, true);
    expect(back[0]).toBeCloseTo(p[0]);
    expect(back[1]).toBeCloseTo(p[1]);
  });
  it("transforms image masks and drawing geometry before digitizing", () => {
    const labels = new Uint8Array(250000);
    labels[250 * 500 + 250] = 5;
    const d = transformDesign(
      {
        labels,
        lines: [
          {
            kind: "satin",
            color: 5,
            pts: [
              [50, 50, 3],
              [55, 50, 3],
            ],
          },
        ],
      },
      { x: 10, y: 0, scale: 2, rotation: 90 },
    );
    expect(d.labels[250 * 500 + 299]).toBe(5);
    expect(d.lines[0].pts[0]).toEqual([60, 50, 6]);
    expect(d.lines[0].pts[1][1]).toBeCloseTo(60);
  });
  it("refuses cropping occupied picture pixels outside the hoop", () => {
    const labels = new Uint8Array(250000);
    labels[0] = 5;
    expect(() =>
      transformDesign({ labels }, { x: -5, y: 0, scale: 1, rotation: 0 }),
    ).toThrow(/hoop/);
  });
  it("preserves sewing order and only merges adjacent colors", () => {
    const block = (c) => ({
      blocks: [
        {
          color: c,
          ops: [
            [20, 20, 1],
            [21, 21, 0],
          ],
        },
      ],
    });
    const plan = composePlans([block(5), block(5), block(20), block(5)]);
    expect(plan.blocks.map((b) => b.color)).toEqual([5, 20, 5]);
    expect(plan.blocks[0].ops.some((p) => p[2] === E.CMD.TRIM)).toBe(true);
    const stream = E.toStream(plan);
    expect(stream.colors).toEqual([5, 20, 5]);
  });
});

it("encodes a combined drawing, picture mask and satin name with intact color stops", async () => {
  const { letteringDesign } = await import("./lettering.js");
  const { studioDesignToPattern } = await import("./toPattern");
  const image = new Uint8Array(250000);
  for (let y = 100; y < 150; y++)
    for (let x = 100; x < 150; x++) image[y * 500 + x] = 5;
  const plan = composePlans([
    E.plan(
      {
        lines: [
          {
            kind: "run",
            color: 37,
            pts: [
              [10, 10, 0],
              [90, 10, 0],
              [90, 90, 0],
              [10, 90, 0],
              [10, 10, 0],
            ],
          },
        ],
      },
      {},
    ),
    E.plan({ labels: image }, {}),
    E.plan(
      transformDesign(
        letteringDesign({ value: "Ravi", heightMM: 8, color: 20 }),
        { x: 0, y: 25, scale: 1, rotation: 0 },
      ),
      {},
    ),
  ]);
  const { stream, colors } = E.toStream(plan);
  const { data } = studioDesignToPattern({
    name: "mixed",
    stitches: E.toRespiraStitches(stream),
    threads: colors.map((index) => ({
      index,
      name: E.PEC[index][3],
      rgb: E.PEC[index].slice(0, 3),
    })),
  });
  expect(colors).toEqual([37, 5, 20]);
  expect(data.penStitches.colorBlocks).toHaveLength(3);
  expect(data.penStitches.stitches.filter((s) => s.isDataEnd)).toHaveLength(1);
  expect(data.penStitches.stitches.at(-1).isDataEnd).toBe(true);
  expect(data.bounds.minX).toBeGreaterThan(-500);
  expect(data.bounds.maxY).toBeLessThan(500);
});
