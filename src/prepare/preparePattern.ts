import type { PesPatternData } from "../formats/import/pesImporter";
import { transformStitchesRotation } from "../utils/rotationUtils";
import { encodeStitchesToPen } from "../formats/pen/encoder";
import { decodePenData } from "../formats/pen/decoder";
import { usePrepareOptions } from "./prepareOptions";
import {
  calculatePatternCenter,
  calculateBoundsFromDecodedStitches,
} from "../components/PatternCanvas/patternCanvasHelpers";

/**
 * Shared by playback and upload: rotation, and the optional pause after each thread cut, are
 * baked into the machine bytes exactly once, here.
 */
export function preparePattern(
  data: PesPatternData,
  offset: { x: number; y: number },
  rotation: number,
  pauseAfterCuts: boolean = usePrepareOptions.getState().pauseAfterCuts,
) {
  if (!rotation && !pauseAfterCuts) return { data, offset };
  const stitches = rotation
    ? transformStitchesRotation(data.stitches, rotation, data.bounds)
    : data.stitches;
  const encoded = encodeStitchesToPen(stitches, {
    stopAfterTrim: pauseAfterCuts,
  });
  const penData = new Uint8Array(encoded.penBytes);
  const penStitches = decodePenData(penData, encoded.trimStops);
  // Pauses sit on points that are already there: without rotation nothing moves.
  if (!rotation) return { data: { ...data, penData, penStitches }, offset };
  const bounds = calculateBoundsFromDecodedStitches(penStitches);
  const before = calculatePatternCenter(data.bounds),
    after = calculatePatternCenter(bounds);
  return {
    data: { ...data, stitches, penData, penStitches, bounds },
    offset: {
      x: offset.x + after.x - before.x,
      y: offset.y + after.y - before.y,
    },
  };
}
