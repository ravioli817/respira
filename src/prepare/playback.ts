import type { DecodedPenData } from "../formats/pen/types";
export function playbackStats(data: DecodedPenData) {
  return {
    commands: data.stitches.length,
    needlePoints: data.stitches.filter(
      (s) => !s.isFeed && !s.isCut && !s.isColorEnd,
    ).length,
    jumps: data.stitches.filter((s) => s.isFeed).length,
    cuts: data.stitches.filter((s) => s.isCut).length,
    colors: data.colorBlocks.length,
  };
}
/** Cursor is the count of commands already shown; decoded block ends include the stop command. */
export function colorAt(data: DecodedPenData, cursor: number) {
  const index = Math.min(Math.max(cursor - 1, 0), data.stitches.length - 1);
  return (
    data.colorBlocks.find(
      (b) => index >= b.startStitchIndex && index <= b.endStitchIndex,
    )?.colorIndex ?? 0
  );
}
export function colorBoundary(
  data: DecodedPenData,
  cursor: number,
  direction: -1 | 1,
) {
  const boundaries = [0, ...data.colorBlocks.map((b) => b.endStitchIndex + 1)];
  return direction === 1
    ? (boundaries.find((n) => n > cursor) ?? data.stitches.length)
    : (boundaries.filter((n) => n < cursor).at(-1) ?? 0);
}
