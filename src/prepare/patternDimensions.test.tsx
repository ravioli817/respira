import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PatternInfo } from "../components/PatternInfo";
import { studioDesignToPattern } from "../studio/toPattern";
import { preparePattern } from "./preparePattern";
import {
  patternDimensions,
  formatPatternDimensions,
} from "./patternDimensions";
const pattern = studioDesignToPattern({
  name: "rectangle",
  threads: [{ index: 5, name: "red", rgb: [237, 23, 31] }],
  stitches: [
    [0, 0, 0, 0],
    [400, 0, 0, 0],
    [400, 100, 0, 0],
    [0, 100, 0, 0],
    [0, 0, 0, 0],
  ],
}).data;
afterEach(cleanup);
it("shows the same rotated dimensions before and after upload, including locks", () => {
  const original = patternDimensions(pattern),
    rotated = patternDimensions(pattern, 90);
  expect(rotated.width).toBeCloseTo(original.height);
  expect(rotated.height).toBeCloseTo(original.width);
  expect(original.width).toBeGreaterThan(40); // the starting lock extends beyond the artwork
  for (const rotation of [0, 45, 90, 180]) {
    const prepared = preparePattern(pattern, { x: 20, y: -50 }, rotation);
    expect(formatPatternDimensions(pattern, rotation)).toBe(
      formatPatternDimensions(prepared.data),
    );
  }
  expect(pattern.stitches[1]).toEqual([400, 0, 0, 0]);
});
it("updates the shared size label when rotation changes", () => {
  const { rerender } = render(<PatternInfo pesData={pattern} rotation={0} />);
  expect(screen.getByText(formatPatternDimensions(pattern))).toBeTruthy();
  rerender(<PatternInfo pesData={pattern} rotation={90} />);
  expect(screen.getByText(formatPatternDimensions(pattern, 90))).toBeTruthy();
  expect(screen.queryByText(formatPatternDimensions(pattern))).toBeNull();
});
