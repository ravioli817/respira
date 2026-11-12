import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { columnUnderlay, maskContours } from "./underlay.js";
import { StitchEngine as E } from "./engine.js";
import { letteringDesign } from "./lettering.js";
import { transformDesign } from "./composition.js";
import { engineSettings, stitchDefaults } from "./stitchSettings.js";
const mask = () => {
  const m = new Uint8Array(250000);
  for (let y = 180; y < 240; y++)
    for (let x = 180; x < 260; x++) m[y * 500 + x] = 5;
  return m;
};
const hash = (p) =>
  createHash("sha256").update(JSON.stringify(p)).digest("hex");
const line = {
  lines: [
    {
      kind: "satin",
      color: 5,
      pts: [
        [20, 30, 3],
        [40, 30, 3],
        [50, 40, 3],
      ],
    },
  ],
};
describe("underlay and pull compensation", () => {
  it("preserves the exact legacy fill and satin plans until customized", () => {
    expect(hash(E.plan({ labels: mask() }, {}))).toBe(
      "6d5171f315466c96b5f626fef9c5f179c68afcb910c2d81b95428282d4b98152",
    );
    expect(hash(E.plan(line, {}))).toBe(
      "cefd77941b6462999a1ac294b7f56f14433d9740bf468eb4237b85ee07399b6e",
    );
    expect(
      engineSettings(
        { kind: "draw" },
        { spacing: 0.4, angle: 45, underlay: false },
      ),
    ).toEqual({ spacing: 0.4, angle: 45, underlay: false });
  });
  it("generates distinct center, edge and zigzag paths inside the original rails", () => {
    const pairs = [
      [0, -1, 0, 1],
      [10, -1, 10, 1],
    ];
    const paths = [
      "center",
      "edge",
      "zigzag",
      "center-edge",
      "center-zigzag",
    ].map((mode) =>
      columnUnderlay(pairs, { mode, inset: 0.4, spacing: 2, stitchLength: 2 }),
    );
    expect(new Set(paths.map(JSON.stringify)).size).toBe(5);
    for (const path of paths)
      for (const [x, y] of path) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(10);
        expect(Math.abs(y)).toBeLessThanOrEqual(0.600001);
      }
    expect(columnUnderlay(pairs, { mode: "none" })).toEqual([]);
    const narrow = columnUnderlay(
      [
        [0, -0.2, 0, 0.2],
        [10, -0.2, 10, 0.2],
      ],
      { mode: "edge", inset: 0.4 },
    );
    expect(narrow.every((p) => p[1] === 0)).toBe(true);
  });
  it("traces islands and holes separately without bridging empty areas", () => {
    const m = new Uint8Array(100);
    for (let y = 1; y < 8; y++)
      for (let x = 1; x < 8; x++)
        if (x < 3 || x > 5 || y < 3 || y > 5) m[y * 10 + x] = 1;
    m[9 * 10 + 9] = 1;
    const contours = maskContours(m, 10, 10, 0.2);
    expect(contours).toHaveLength(3);
    for (const path of contours) {
      expect(path[0]).toEqual(path.at(-1));
      for (let i = 1; i < path.length; i++)
        expect(
          Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]),
        ).toBeCloseTo(0.2);
    }
  });
  it("applies fill compensation per endpoint and supports zero", () => {
    const zero = E.planStats(
      E.plan(
        { labels: mask() },
        { angle: 0, fillUnderlay: "none", fillPullMm: 0 },
      ),
    );
    const pulled = E.planStats(
      E.plan(
        { labels: mask() },
        { angle: 0, fillUnderlay: "none", fillPullMm: 0.3 },
      ),
    );
    expect(pulled.width - zero.width).toBeCloseTo(0.6);
    expect(pulled.height).toBeCloseTo(zero.height);
  });
  it("applies satin compensation per edge without mutating the source", () => {
    const design = {
      lines: [
        {
          kind: "satin",
          color: 5,
          pts: [
            [20, 50, 3],
            [80, 50, 3],
          ],
        },
      ],
    };
    const zero = E.planStats(
      E.plan(design, { satinUnderlay: "none", satinPullMm: 0 }),
    );
    const pulled = E.planStats(
      E.plan(design, { satinUnderlay: "none", satinPullMm: 0.4 }),
    );
    expect(pulled.height - zero.height).toBeCloseTo(0.8);
    expect(design.lines[0].pts[0]).toEqual([20, 50, 3]);
  });
  it("adds inset contour and sparse fill underlay before the top fill", () => {
    const none = E.planStats(
      E.plan({ labels: mask() }, { fillUnderlay: "none" }),
    );
    const edge = E.planStats(
      E.plan(
        { labels: mask() },
        { fillUnderlay: "edge", underlayInsetMm: 0.6, underlayStitchMm: 2 },
      ),
    );
    const both = E.planStats(
      E.plan(
        { labels: mask() },
        {
          fillUnderlay: "edge-tatami",
          underlayInsetMm: 0.6,
          underlayStitchMm: 2,
          underlaySpacingMm: 2,
        },
      ),
    );
    expect(edge.stitches).toBeGreaterThan(none.stitches);
    expect(both.stitches).toBeGreaterThan(edge.stitches);
    expect(edge.bounds).toEqual(none.bounds);
    expect(both.bounds).toEqual(none.bounds);
  });
  it("keeps lettering pull in physical millimeters when the object is scaled", () => {
    const text = { value: "I", heightMM: 6, color: 5 },
      t = { x: 0, y: 0, scale: 2, rotation: 0 };
    const options = {
      ...stitchDefaults(
        { kind: "text", source: { font: "SmallSatin" } },
        { spacing: 0.4, angle: 45, underlay: true },
      ),
      satinUnderlay: "none",
    };
    const zero = E.planStats(
      E.plan(
        transformDesign(
          letteringDesign(text, 2, true, { ...options, satinPullMm: 0 }),
          t,
        ),
        {},
      ),
    );
    const pulled = E.planStats(
      E.plan(
        transformDesign(
          letteringDesign(text, 2, true, { ...options, satinPullMm: 0.3 }),
          t,
        ),
        {},
      ),
    );
    expect(pulled.width - zero.width).toBeCloseTo(0.6, 1);
    const center = letteringDesign(text, 1, true, options);
    const edge = letteringDesign(text, 1, true, {
      ...options,
      satinUnderlay: "edge",
    });
    expect(edge.paths.flatMap((p) => p.pts).length).toBeGreaterThan(
      center.paths.flatMap((p) => p.pts).length,
    );
  });
});

it("connects combined underlays at nearby rail ends instead of stitching across a curved column", () => {
  const pairs = Array.from({ length: 101 }, (_, i) => {
    const a = (i * Math.PI) / 100;
    return [
      9 * Math.cos(a),
      9 * Math.sin(a),
      11 * Math.cos(a),
      11 * Math.sin(a),
    ];
  });
  const path = columnUnderlay(pairs, {
    mode: "center-edge",
    inset: 0.4,
    stitchLength: 2,
  });
  for (let i = 1; i < path.length; i++)
    expect(
      Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]),
    ).toBeLessThan(3);
});
