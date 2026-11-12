import { describe, expect, it } from "vitest";
import font from "./fonts/small-satin/geometry.json";
import { letteringDesign } from "./lettering.js";
import { StitchEngine as E } from "./engine.js";
import { transformDesign } from "./composition.js";
const options = {
  value: "Ravi",
  heightMM: 8,
  color: 5,
  letterSpacing: 0.5,
  lineGap: 2,
  align: "center",
};
describe("embroidery lettering", () => {
  it("contains paired satin rails for every bundled glyph and preserves counters", () => {
    expect(Object.keys(font.glyphs)).toHaveLength(98);
    for (const [char, glyph] of Object.entries(font.glyphs)) {
      expect(glyph.bounds[3] - glyph.bounds[1], char).toBeLessThan(
        font.capHeight * 1.8,
      );
      expect(glyph.columns.length + glyph.runs.length, char).toBeGreaterThan(0);
      const design = letteringDesign({ ...options, value: char });
      for (const path of design.paths)
        for (const p of path.pts)
          expect(p.every(Number.isFinite), char).toBe(true);
      expect(E.planStats(E.plan(design, {})).stitches, char).toBeGreaterThan(0);
    }
    expect(font.glyphs.O.columns.length).toBeGreaterThan(0);
    expect(
      letteringDesign({ ...options, value: "O" }).labels.some(Boolean),
    ).toBe(false);
  });
  it("regenerates density after scaling rather than stretching a stitch plan", () => {
    const normal = E.plan(letteringDesign(options), {});
    const scaled = E.plan(
      transformDesign(letteringDesign(options, 1.5), {
        x: 0,
        y: 0,
        scale: 1.5,
        rotation: 0,
      }),
      {},
    );
    expect(E.planStats(scaled).stitches).toBeGreaterThan(
      E.planStats(normal).stitches * 1.2,
    );
    for (const block of scaled.blocks)
      for (let i = 1; i < block.ops.length; i++)
        if (
          block.ops[i][2] === E.CMD.STITCH &&
          block.ops[i - 1][2] === E.CMD.STITCH
        )
          expect(
            Math.hypot(
              block.ops[i][0] - block.ops[i - 1][0],
              block.ops[i][1] - block.ops[i - 1][1],
            ),
          ).toBeLessThanOrEqual(7.001);
  });
  it("enforces final size and reports unsupported glyphs instead of dropping them", () => {
    expect(() => letteringDesign({ ...options, heightMM: 3 })).toThrow(
      /4 and 15/,
    );
    expect(() => letteringDesign(options, 2)).toThrow(/4 and 15/);
    expect(() => letteringDesign({ ...options, value: "Ravi 😀" })).toThrow(
      /😀/,
    );
    expect(letteringDesign({ ...options, value: "" }).paths).toHaveLength(0);
  });
  it("supports multiline alignment and center-walk underlay", () => {
    const t = { ...options, value: "WW\nI", align: "left" };
    const left = letteringDesign(t),
      right = letteringDesign({ ...t, align: "right" });
    expect(left.paths.at(-1).pts[0][0]).toBeLessThan(
      right.paths.at(-1).pts[0][0],
    );
    expect(
      letteringDesign(options, 1, true).paths.flatMap((p) => p.pts).length,
    ).toBeGreaterThan(
      letteringDesign(options, 1, false).paths.flatMap((p) => p.pts).length,
    );
  });
});
