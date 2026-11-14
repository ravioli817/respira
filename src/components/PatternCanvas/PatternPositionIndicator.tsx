// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
/**
 * PatternPositionIndicator Component
 *
 * One line under the canvas: what dragging does, and where the design sits.
 * Says so when the design has been sent and can no longer be moved.
 */

import { LockClosedIcon } from "@heroicons/react/24/solid";

interface PatternPositionIndicatorProps {
  offset: { x: number; y: number };
  rotation?: number;
  isLocked: boolean;
  isUploading: boolean;
}

export function PatternPositionIndicator({
  offset,
  rotation = 0,
  isLocked,
  isUploading,
}: PatternPositionIndicatorProps) {
  const fixed = isUploading || isLocked;
  return (
    <p className="text-sm text-gray-700 dark:text-gray-300 min-w-0">
      {fixed && (
        <LockClosedIcon
          aria-hidden="true"
          className="inline w-4 h-4 mr-1.5 -mt-0.5 text-amber-600 dark:text-amber-400"
        />
      )}
      {isUploading
        ? "Sending to the machine…"
        : isLocked
          ? "Sent to the machine, so it can't be moved now. Drag to look around."
          : "Drag the design to move it. Drag the background to look around."}{" "}
      <span className="whitespace-nowrap tabular-nums text-gray-500 dark:text-gray-400">
        {(offset.x / 10).toFixed(1)} mm across, {(offset.y / 10).toFixed(1)} mm
        down from the center
        {!fixed && rotation !== 0 && `, turned ${rotation.toFixed(0)}°`}
      </span>
    </p>
  );
}
