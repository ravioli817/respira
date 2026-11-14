import { expect, it } from "vitest";
import { designName } from "./designName";

it("shows a design by its name, without the file ending", () => {
  expect(designName("Flower.pes")).toBe("Flower");
  expect(designName("towel name.PES")).toBe("towel name");
  expect(designName("Flower")).toBe("Flower");
  expect(designName("")).toBe("");
  expect(designName(null)).toBe("");
});
