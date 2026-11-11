import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MachineStatusNames } from "../types/machine";
import { MachineStatus } from "../types/machine";
import { getPracticeMachine, type PracticeSnapshot } from "./practiceMachine";

/**
 * The pretend machine's buttons, shown only in practice mode. On the real Skitch these are the
 * physical Accept and Start/Stop buttons.
 */
export function PracticePanel() {
  const machine = getPracticeMachine();
  const [state, setState] = useState<PracticeSnapshot | null>(
    machine ? machine.snapshot() : null,
  );

  useEffect(() => {
    if (!machine) return;
    return machine.watch(setState);
  }, [machine]);

  if (!machine || !state) return null;

  const statusName = MachineStatusNames[state.status] ?? "Unknown";

  return (
    <aside
      aria-label="Practice machine"
      className="flex-shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 border-t-2 border-dashed border-warning-500 bg-warning-50 dark:bg-warning-900/20 px-4 sm:px-5 lg:px-6 py-2"
    >
      <p className="text-sm text-gray-800 dark:text-gray-200 mr-auto">
        <strong>Practice machine.</strong> No real Skitch is connected; these
        stand in for its buttons.{" "}
        {state.connected ? `It says: ${statusName}.` : "Not connected."}
      </p>
      <Button size="sm" onClick={() => machine.press("accept")}>
        Accept
      </Button>
      <Button size="sm" onClick={() => machine.press("start")}>
        Start/Stop
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={state.status !== MachineStatus.SEWING}
        onClick={() => machine.breakThread()}
      >
        Snap the thread
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!state.connected}
        onClick={() => machine.drop()}
      >
        Drop Bluetooth
      </Button>
    </aside>
  );
}
