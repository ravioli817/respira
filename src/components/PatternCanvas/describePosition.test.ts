import { expect, it } from "vitest";
import { describePosition } from "./describePosition";

it("says where a design sits in the hoop in plain words", () => {
  expect(describePosition({ x: 0, y: 0 })).toBe("In the center of the hoop");
  expect(describePosition({ x: 4, y: -4 })).toBe("In the center of the hoop");
  expect(describePosition({ x: -20, y: 30 })).toBe(
    "2 mm left of the center, 3 mm below it",
  );
  expect(describePosition({ x: 150, y: -70 })).toBe(
    "15 mm right of the center, 7 mm above it",
  );
  expect(describePosition({ x: 0, y: 30 })).toBe("3 mm below the center");
  expect(describePosition({ x: 120, y: 0 })).toBe("12 mm right of the center");
});
