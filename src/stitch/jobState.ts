import { create } from "zustand";
import {
  selectPatternUploaded,
  useMachineStore,
} from "../stores/useMachineStore";
import { MachineStatus } from "../types/machine";

interface JobState {
  /**
   * The machine reported this job complete, and the job has not been deleted,
   * replaced or started again since.
   */
  finished: boolean;
}

/** What the app has watched happen to the job the machine holds. */
export const useJobState = create<JobState>(() => ({ finished: false }));

/**
 * Remembers the machine's own "sewing complete" status until the job is deleted or sewn
 * again. After a finished job the machine goes idle with the design still loaded, and
 * nothing in its idle status says the design has already been sewn.
 *
 * Returns a function that stops watching.
 */
export function watchJob(): () => void {
  let previous = useMachineStore.getState().machineStatus;
  return useMachineStore.subscribe((machine) => {
    const status = machine.machineStatus;
    if (!machine.isConnected || !selectPatternUploaded(machine)) {
      previous = status;
      if (useJobState.getState().finished)
        useJobState.setState({ finished: false });
      return;
    }
    if (status === previous) return;
    previous = status;

    if (status === MachineStatus.SEWING_COMPLETE)
      useJobState.setState({ finished: true });
    else if (status === MachineStatus.SEWING)
      useJobState.setState({ finished: false });
  });
}
