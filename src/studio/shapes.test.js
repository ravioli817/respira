import { describe, expect, it } from "vitest";
import { shapePoints } from "./shapes.js";
import { StitchEngine as E } from "./engine.js";
describe("preset shapes", () => {
  it.each(["ellipse", "rectangle", "triangle", "star", "heart"])(
    "sizes and closes %s precisely in hoop coordinates",
    (kind) => {
      const p = shapePoints(kind, 30, 20, 40, 60, 2);
      expect(p[0]).toEqual(p.at(-1));
      expect(Math.min(...p.map((q) => q[0]))).toBeCloseTo(25);
      expect(Math.max(...p.map((q) => q[0]))).toBeCloseTo(55);
      expect(Math.min(...p.map((q) => q[1]))).toBeCloseTo(50);
      expect(Math.max(...p.map((q) => q[1]))).toBeCloseTo(70);
      const plan = E.plan(
        { lines: [{ kind: "run", color: 5, pts: p.map((q) => [...q, 0]) }] },
        {},
      );
      expect(E.planStats(plan).stitches).toBeGreaterThan(10);
    },
  );
  it("accounts for the satin outline at hoop edges", () => {
    expect(() => shapePoints("rectangle", 98, 98, 50, 50, 2)).toThrow(/hoop/);
    expect(() => shapePoints("ellipse", 20, 20, 5, 50, 0)).toThrow(/hoop/);
    expect(() => shapePoints("heart", NaN, 20)).toThrow();
    expect(() => shapePoints("unknown", 20, 20)).toThrow();
  });
});
