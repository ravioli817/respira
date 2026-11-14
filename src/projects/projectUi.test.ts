import { expect, it } from "vitest";
import { displayName } from "./projectUi";

it("shows a design's name as words, and an unnamed design as no name", () => {
  expect(displayName("my-drawing")).toBe("My drawing");
  expect(displayName("towel_name.PES")).toBe("Towel name");
  expect(displayName("Flower.pes")).toBe("Flower");
  // What an unnamed design is sent as.
  expect(displayName("design.pes")).toBe("");
  expect(displayName("")).toBe("");
  expect(displayName(null)).toBe("");
});
