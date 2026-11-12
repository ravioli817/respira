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
