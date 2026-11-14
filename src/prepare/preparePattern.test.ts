import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { studioDesignToPattern } from "../studio/toPattern";
import { preparePattern } from "./preparePattern";
import { colorAt, colorBoundary, playbackStats } from "./playback";
import { usePatternRotationUpload } from "../hooks/domain/usePatternRotationUpload";

function samplePattern() {
  return studioDesignToPattern({
    name: "two colors",
    threads: [
      { index: 5, name: "red", rgb: [237, 23, 31] },
      { index: 20, name: "black", rgb: [0, 0, 0] },
    ],
    stitches: [
      [100, 100, 0, 0],
      [150, 100, 0, 0],
      [150, 100, 32, 0],
      [180, 100, 16, 0],
      [200, 100, 0, 0],
      [200, 200, 0, 1],
      [220, 220, 0, 1],
    ],
  }).data;
}

describe("final stitch playback data", () => {
  it.each([0, 45, 90, 180])(
    "uses the same final bytes and offset as upload at %s degrees",
    async (rotation) => {
      const pattern = samplePattern(),
        offset = { x: 50, y: -25 };
      const expected = preparePattern(pattern, offset, rotation);
      const uploadPattern = vi.fn().mockResolvedValue(undefined),
        setUploadedPattern = vi.fn();
      const { result } = renderHook(() =>
        usePatternRotationUpload({ uploadPattern, setUploadedPattern }),
      );
      await act(() =>
        result.current.handleUpload(pattern, "test.pes", offset, rotation),
      );
      expect(uploadPattern.mock.calls[0][0]).toEqual(expected.data.penData);
      expect(uploadPattern.mock.calls[0][3]).toEqual(expected.offset);
      expect(setUploadedPattern).toHaveBeenCalledWith(
        expected.data,
        expected.offset,
      );
      expect(pattern.stitches[0]).toEqual([100, 100, 0, 0]);
    },
  );
  it("includes inserted lock stitches, cuts, jumps and color stops", () => {
    const data = samplePattern();
    const stats = playbackStats(data.penStitches);
    expect(stats.commands).toBeGreaterThan(data.stitches.length);
    expect(stats.cuts).toBe(2);
    expect(stats.jumps).toBe(2);
    expect(stats.colors).toBe(2);
    const boundary = data.penStitches.colorBlocks[0].endStitchIndex + 1;
    expect(colorAt(data.penStitches, boundary)).toBe(0);
    expect(colorAt(data.penStitches, boundary + 1)).toBe(1);
    expect(colorBoundary(data.penStitches, 0, 1)).toBe(boundary);
    expect(colorBoundary(data.penStitches, boundary, -1)).toBe(0);
    expect(colorBoundary(data.penStitches, stats.commands, 1)).toBe(
      stats.commands,
    );
  });
});

import { usePrepareOptions } from "./prepareOptions";
import { restoreCachedPattern } from "./restoreCachedPattern";
it("keeps raw artwork in pause-only upload caches and restores uploaded offsets exactly once", async () => {
  const original = samplePattern(),
    offset = { x: 123, y: -45 };
  const uploadPattern = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    usePatternRotationUpload({ uploadPattern, setUploadedPattern: vi.fn() }),
  );
  usePrepareOptions.getState().setPauseAfterCuts(true);
  try {
    await act(() =>
      result.current.handleUpload(original, "test.pes", offset, 0),
    );
    expect(uploadPattern.mock.calls[0][5]).toBe(original);
    for (const rotation of [0, 45, 90]) {
      const prepared = preparePattern(original, offset, rotation, true);
      const restored = restoreCachedPattern({
        pesData: original,
        uploadedPesData: prepared.data,
        patternOffset: prepared.offset,
        patternRotation: rotation,
      });
      expect(restored.uploadedOffset).toEqual(prepared.offset);
      expect(restored.originalOffset.x).toBeCloseTo(offset.x);
      expect(restored.originalOffset.y).toBeCloseTo(offset.y);
      expect(
        preparePattern(restored.original, restored.originalOffset, 0, false)
          .data.penData,
      ).toEqual(original.penData);
    }
  } finally {
    usePrepareOptions.getState().setPauseAfterCuts(false);
  }
});
