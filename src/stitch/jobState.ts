import { create } from "zustand";
import { useMachineStore } from "../stores/useMachineStore";
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
 * Covers two gaps left by the machine store's polling, which reads stitch progress only
 * while the machine is sewing:
 *
 * - When the machine stops for a thread change or at the end, the stitch count on hand is
 *   up to a poll old. The thread prompt and the progress bar are worked out from that
 *   count, so it is read once more as soon as the stop is seen.
 * - "Finished" cannot be inferred from the count reaching the total, because the last
 *   reading is taken before the end. The machine's own completion status is remembered
 *   instead, until the job is deleted or sewn again.
 *
 * Returns a function that stops watching.
 */
export function watchJob(): () => void {
  let previous = useMachineStore.getState().machineStatus;
  return useMachineStore.subscribe((machine) => {
    const status = machine.machineStatus;
    if (!machine.isConnected || machine.patternInfo === null) {
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

    if (
      status === MachineStatus.COLOR_CHANGE_WAIT ||
      status === MachineStatus.SEWING_COMPLETE
    ) {
      // Asked of the service directly: a failed extra reading is not worth an error banner,
      // the next poll will speak up if the connection is really gone.
      machine.service
        .getSewingProgress()
        .then((progress) =>
          useMachineStore.setState({ sewingProgress: progress }),
        )
        .catch(() => {});
    }
  });
}
