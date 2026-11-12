// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
import { useMemo } from "react";
import type { PesPatternData } from "../../formats/import/pesImporter";
import type { MachineInfo } from "../../types/machine";
import { preparePattern } from "../../prepare/preparePattern";
import { calculatePatternCenter } from "../../components/PatternCanvas/patternCanvasHelpers";

export interface PatternBoundsCheckResult {
  fits: boolean;
  error: string | null;
}

export interface UsePatternValidationParams {
  pesData: PesPatternData | null;
  machineInfo: Pick<MachineInfo, "maxWidth" | "maxHeight"> | null;
  patternOffset: { x: number; y: number };
  patternRotation: number;
}

/**
 * Custom hook for validating pattern bounds against hoop size
 *
 * Checks if the pattern (with rotation and offset applied) fits within
 * the machine's hoop bounds and provides detailed error messages if not.
 *
 * @param params - Pattern and machine configuration
 * @returns Bounds check result with fit status and error message
 */
export function usePatternValidation({
  pesData,
  machineInfo,
  patternOffset,
  patternRotation,
}: UsePatternValidationParams): PatternBoundsCheckResult {
  // Memoize the bounds check calculation to avoid unnecessary recalculations
  return useMemo((): PatternBoundsCheckResult => {
    if (!pesData || !machineInfo) {
      return { fits: true, error: null };
    }

    // Use the same encoded geometry and adjusted placement as upload. Lock stitches
    // and jumps can extend beyond the original artwork's bounds.
    const prepared = preparePattern(pesData, patternOffset, patternRotation);
    const center = calculatePatternCenter(prepared.data.bounds);
    let patternMinX = Infinity,
      patternMaxX = -Infinity,
      patternMinY = Infinity,
      patternMaxY = -Infinity;
    for (const stitch of prepared.data.penStitches.stitches) {
      const x = prepared.offset.x - center.x + stitch.x,
        y = prepared.offset.y - center.y + stitch.y;
      patternMinX = Math.min(patternMinX, x);
      patternMaxX = Math.max(patternMaxX, x);
      patternMinY = Math.min(patternMinY, y);
      patternMaxY = Math.max(patternMaxY, y);
      if (stitch.isDataEnd) break;
    }
    const { maxWidth, maxHeight } = machineInfo;

    // Hoop bounds (centered at origin)
    const hoopMinX = -maxWidth / 2;
    const hoopMaxX = maxWidth / 2;
    const hoopMinY = -maxHeight / 2;
    const hoopMaxY = maxHeight / 2;

    // Check if pattern exceeds hoop bounds
    const exceedsLeft = patternMinX < hoopMinX;
    const exceedsRight = patternMaxX > hoopMaxX;
    const exceedsTop = patternMinY < hoopMinY;
    const exceedsBottom = patternMaxY > hoopMaxY;

    if (exceedsLeft || exceedsRight || exceedsTop || exceedsBottom) {
      const directions = [];
      if (exceedsLeft)
        directions.push(
          `left by ${((hoopMinX - patternMinX) / 10).toFixed(1)}mm`,
        );
      if (exceedsRight)
        directions.push(
          `right by ${((patternMaxX - hoopMaxX) / 10).toFixed(1)}mm`,
        );
      if (exceedsTop)
        directions.push(
          `top by ${((hoopMinY - patternMinY) / 10).toFixed(1)}mm`,
        );
      if (exceedsBottom)
        directions.push(
          `bottom by ${((patternMaxY - hoopMaxY) / 10).toFixed(1)}mm`,
        );

      return {
        fits: false,
        error: `Pattern exceeds hoop bounds: ${directions.join(", ")}. Adjust pattern position in preview.`,
      };
    }

    return { fits: true, error: null };
  }, [pesData, machineInfo, patternOffset, patternRotation]);
}
