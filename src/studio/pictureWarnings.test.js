import { expect, it } from "vitest";
import { pictureDetailWarnings } from "./pictureWarnings.js";
import { transformDesign } from "./composition.js";
function bar(color = 5) {
  const labels = new Uint8Array(250000);
  for (let y = 248; y < 252; y++)
    for (let x = 225; x < 275; x++) labels[y * 500 + x] = color;
  return { labels };
}
it("warns on a thin picture at final size and clears after enlargement or exclusion", () => {
  const layer = { id: "pic", name: "Logo", kind: "image", visible: true };
  expect(pictureDetailWarnings([{ layer, design: bar() }])[0]).toContain(
    "Logo",
  );
  const larger = transformDesign(bar(), { x: 0, y: 0, scale: 2, rotation: 0 });
  expect(pictureDetailWarnings([{ layer, design: larger }])).toEqual([]);
  expect(
    pictureDetailWarnings([
      { layer: { ...layer, visible: false }, design: bar() },
    ]),
  ).toEqual([]);
  expect(
    pictureDetailWarnings([
      { layer: { ...layer, kind: "draw" }, design: bar() },
    ]),
  ).toEqual([]);
});
it("detects a fine color stripe inside a larger solid silhouette", () => {
  const design = bar();
  for (let y = 220; y < 280; y++)
    for (let x = 220; x < 280; x++)
      if (!design.labels[y * 500 + x]) design.labels[y * 500 + x] = 20;
  expect(
    pictureDetailWarnings([
      { layer: { kind: "image", name: "Stripe" }, design },
    ]),
  ).toHaveLength(1);
});
