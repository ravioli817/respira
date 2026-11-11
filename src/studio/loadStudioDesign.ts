import { useMachineStore } from "../stores/useMachineStore";
import { useMachineUploadStore } from "../stores/useMachineUploadStore";
import { usePatternStore } from "../stores/usePatternStore";
import { studioDesignToPattern } from "./toPattern";
import type { StudioDesign } from "./studioApp.js";

/**
 * Puts a Create-screen design where a loaded PES file would go, positioned in the hoop where it was drawn.
 * Returns a message when the design cannot be taken right now, otherwise null.
 */
export function loadStudioDesign(design: StudioDesign): string | null {
  if (useMachineUploadStore.getState().isUploading) {
    return "A design is being sent to the machine right now. Wait for it to finish.";
  }
  if (useMachineStore.getState().patternInfo !== null) {
    return "The machine already holds a design. Finish it or delete it on the Stitch screen, then send this one.";
  }

  try {
    const { data, center } = studioDesignToPattern(design);
    const pattern = usePatternStore.getState();
    pattern.setPattern(data, `${design.name}.pes`);
    pattern.setPatternOffset(center.x, center.y);
    return null;
  } catch (err) {
    return err instanceof Error
      ? err.message
      : "This design could not be prepared.";
  }
}
