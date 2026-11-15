// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
/**
 * PatternPositionIndicator Component
 *
 * One line on the mat under the hoop: where the design sits, and what dragging does.
 * Says so when the design has been sent and can no longer be moved.
 */

import { describePosition } from "./describePosition";

interface PatternPositionIndicatorProps {
  offset: { x: number; y: number };
  rotation?: number;
  isLocked: boolean;
  isUploading: boolean;
  hasPattern?: boolean;
}

export function PatternPositionIndicator({
  offset,
  rotation = 0,
  isLocked,
  isUploading,
  hasPattern = true,
}: PatternPositionIndicatorProps) {
  const turn = Math.round(((rotation % 360) + 360) % 360);
  return (
    <p className="flex-1 basis-56 min-w-0 text-center text-white">
      {!hasPattern
        ? "Nothing in the hoop yet. Draw something on Create, then tap Place."
        : isUploading
          ? "Sending to the machine…"
          : isLocked
            ? "On the machine: it stitches exactly here."
            : `${describePosition(offset)}${turn ? `, turned ${turn}°` : ""}. Drag it to move it.`}
    </p>
  );
}
