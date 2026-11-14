// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
/**
 * ZoomControls Component
 *
 * Provides zoom and pan controls for the pattern canvas
 * Includes zoom in/out and reset zoom buttons
 */

import { PlusIcon, MinusIcon, ArrowPathIcon } from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";

interface ZoomControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: ZoomControlsProps) {
  return (
    <div className="flex flex-shrink-0 gap-2 items-center">
      <Button
        variant="outline"
        size="icon"
        className="size-10"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <PlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
      </Button>
      <span className="min-w-[40px] sm:min-w-[50px] text-center text-sm font-semibold text-gray-900 dark:text-gray-100 select-none">
        {Math.round(scale * 100)}%
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-10"
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <MinusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-10"
        onClick={onZoomReset}
        title="Show the whole hoop"
        aria-label="Show the whole hoop"
      >
        <ArrowPathIcon className="w-4 h-4 sm:w-5 sm:h-5" />
      </Button>
    </div>
  );
}
