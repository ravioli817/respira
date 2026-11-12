import type { PesPatternData } from "../formats/import/pesImporter";
import { transformStitchesRotation } from "../utils/rotationUtils";
import { encodeStitchesToPen } from "../formats/pen/encoder";
import { decodePenData } from "../formats/pen/decoder";
import {
  calculatePatternCenter,
  calculateBoundsFromDecodedStitches,
} from "../components/PatternCanvas/patternCanvasHelpers";

/** Shared by playback and upload: rotation is baked into the machine bytes exactly once. */
export function preparePattern(
  data: PesPatternData,
  offset: { x: number; y: number },
  rotation: number,
) {
  if (!rotation) return { data, offset };
  const stitches = transformStitchesRotation(
    data.stitches,
    rotation,
    data.bounds,
  );
  const penData = new Uint8Array(encodeStitchesToPen(stitches).penBytes);
  const penStitches = decodePenData(penData);
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
