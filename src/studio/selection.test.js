import { expect, it } from "vitest";
import { hitTestLayer } from "./selection.js";
it("selects the topmost included object and ignores empty canvas", () => {
  const labels = new Uint8Array(250000);
  labels[250 * 500 + 250] = 5;
  const parts = [
    { layer: { id: "image", visible: true }, design: { labels } },
    {
      layer: { id: "text", visible: true },
      design: {
        paths: [
          {
            pts: [
              [49, 50],
              [51, 50],
            ],
          },
        ],
      },
    },
  ];
  expect(hitTestLayer(parts, [50, 50])).toBe("text");
  parts[1].layer.visible = false;
  expect(hitTestLayer(parts, [50, 50])).toBe("image");
  expect(hitTestLayer(parts, [10, 10])).toBeNull();
});

import { designBounds, scaleAbout, resizeFromCorner } from "./selection.js";
import { transformPoint } from "./composition.js";

it("measures fill cells and satin width without counting empty space", () => {
  const labels = new Uint8Array(250000);
  labels[50 * 500 + 100] = 2;
  designBounds({ labels }).forEach((value, i) =>
    expect(value).toBeCloseTo([20, 10, 20.2, 10.2][i]),
  );
  expect(
    designBounds({
      lines: [
        {
          pts: [
            [30, 20, 4],
            [50, 40, 2],
          ],
        },
      ],
    }),
  ).toEqual([28, 18, 51, 41]);
  expect(
    designBounds({ labels: new Uint8Array(250000), lines: [] }),
  ).toBeNull();
});

it("resizes rotated artwork about a fixed corner and clamps scale without flipping", () => {
  const transform = { x: 12, y: -8, scale: 1, rotation: 90 };
  const anchor = [20, 30],
    point = [65, 45];
  const before = transformPoint(point, transform);
  const after = transformPoint(point, scaleAbout(transform, 1.5, anchor));
  expect(after[0]).toBeCloseTo(anchor[0] + 1.5 * (before[0] - anchor[0]));
  expect(after[1]).toBeCloseTo(anchor[1] + 1.5 * (before[1] - anchor[1]));
  const resized = resizeFromCorner(transform, [20, 30, 40, 50], "se", [60, 70]);
  expect(resized.scale).toBe(2);
  expect(resized.rotation).toBe(90);
  expect(
    resizeFromCorner(transform, [20, 30, 40, 50], "nw", [60, 70]).scale,
  ).toBe(0.1);
  expect(scaleAbout(transform, 100, anchor).scale).toBe(4);
});
