import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMachineStore } from "../stores/useMachineStore";
import { useMachineUploadStore } from "../stores/useMachineUploadStore";
import { usePatternStore } from "../stores/usePatternStore";
import { calculateColorBlocks } from "../utils/colorBlockHelpers";
import { getNextStep, type NextStep } from "./nextStep";
import { useJobState } from "../stitch/jobState";

/** The current "what to do now" for the Stitch screen, from the app's existing stores. */
export function useNextStep(): NextStep | null {
  const machine = useMachineStore(
    useShallow((state) => ({
      isConnected: state.isConnected,
      machineStatus: state.machineStatus,
      machineError: state.machineError,
      patternUploaded: state.patternInfo !== null,
      currentStitch:
        state.adjustedStitchIndex ?? state.sewingProgress?.currentStitch ?? 0,
    })),
  );
  const isUploading = useMachineUploadStore((state) => state.isUploading);
  const finished = useJobState((state) => state.finished);
  const pesData = usePatternStore((state) => state.pesData);
  const uploadedPesData = usePatternStore((state) => state.uploadedPesData);
  const displayPattern = machine.patternUploaded ? uploadedPesData : pesData;

  const colorBlocks = useMemo(
    () => calculateColorBlocks(displayPattern),
    [displayPattern],
  );

  return useMemo(
    () =>
      getNextStep({
        ...machine,
        hasPattern: displayPattern !== null,
        isUploading,
        colorBlocks,
        finished,
      }),
    [machine, displayPattern, isUploading, colorBlocks, finished],
  );
}
