import type { PesPatternData } from "../formats/import/pesImporter";
import { calculatePatternCenter } from "../components/PatternCanvas/patternCanvasHelpers";
import { preparePattern } from "./preparePattern";

/** Cache offsets describe the uploaded job; undo the center adjustment only for the editable draft. */
export function restoreCachedPattern(cached: {
  pesData: PesPatternData;
  uploadedPesData?: PesPatternData;
  patternOffset?: { x: number; y: number };
  patternRotation?: number;
}) {
  const rotation = cached.patternRotation || 0;
  const uploaded =
    cached.uploadedPesData ||
    preparePattern(cached.pesData, { x: 0, y: 0 }, rotation, false).data;
  const uploadedOffset = cached.patternOffset || { x: 0, y: 0 };
  const before = calculatePatternCenter(cached.pesData.bounds);
  const after = calculatePatternCenter(uploaded.bounds);
  return {
    original: cached.pesData,
    uploaded,
    uploadedOffset,
    rotation,
    originalOffset: rotation
      ? {
          x: uploadedOffset.x - (after.x - before.x),
          y: uploadedOffset.y - (after.y - before.y),
        }
      : uploadedOffset,
  };
}
