import { expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePatternValidation } from "./usePatternValidation";
import { studioDesignToPattern } from "../../studio/toPattern";
const pattern = studioDesignToPattern({
  name: "edge",
  threads: [{ index: 5, name: "red", rgb: [237, 23, 31] }],
  stitches: [
    [0, 0, 0, 0],
    [100, 0, 0, 0],
  ],
}).data;
it("rejects machine lock stitches outside the hoop even when the artwork fits", () => {
  const { result } = renderHook(() =>
    usePatternValidation({
      pesData: pattern,
      machineInfo: { maxWidth: 1000, maxHeight: 1000 },
      patternOffset: { x: -450, y: 0 },
      patternRotation: 0,
    }),
  );
  expect(result.current.fits).toBe(false);
  expect(result.current.error).toContain("left by 0.2mm");
});
it("validates the actual rotated upload geometry and offset", () => {
  const { result, rerender } = renderHook(
    ({ y }) =>
      usePatternValidation({
        pesData: pattern,
        machineInfo: { maxWidth: 1000, maxHeight: 1000 },
        patternOffset: { x: 0, y },
        patternRotation: 90,
      }),
    { initialProps: { y: 0 } },
  );
  expect(result.current.fits).toBe(true);
  rerender({ y: 600 });
  expect(result.current.fits).toBe(false);
});
