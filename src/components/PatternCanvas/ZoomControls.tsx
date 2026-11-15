// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
/**
 * ZoomControls Component
 *
 * Zoom in, zoom out and back to the starting view, as buttons laid on the mat.
 */

import { PlusIcon, MinusIcon } from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";

interface ZoomControlsProps {
  /** "Real size", or the zoom as a percentage of it. */
  label: string;
  buttonClassName?: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export function ZoomControls({
  label,
  buttonClassName,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: ZoomControlsProps) {
  return (
    <div className="flex flex-shrink-0 gap-1 items-center" role="group">
      <button
        type="button"
        className={cn(buttonClassName, "w-11 px-0")}
        onClick={onZoomOut}
        aria-label="Zoom out"
      >
        <MinusIcon className="size-5" />
      </button>
      <button
        type="button"
        className={cn(buttonClassName, "min-w-[6.5rem] px-3 tabular-nums")}
        onClick={onZoomReset}
        aria-label={`${label}. Back to the starting view`}
      >
        {label}
      </button>
      <button
        type="button"
        className={cn(buttonClassName, "w-11 px-0")}
        onClick={onZoomIn}
        aria-label="Zoom in"
      >
        <PlusIcon className="size-5" />
      </button>
    </div>
  );
}
