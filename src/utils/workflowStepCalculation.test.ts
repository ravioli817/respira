import { describe, expect, it } from "vitest";
import { getCurrentStep } from "./workflowStepCalculation";
import { MachineStatus } from "../types/machine";

describe("workflow after reconnect without a local PES", () => {
  it.each([
    [MachineStatus.SEWING, 7],
    [MachineStatus.COLOR_CHANGE_WAIT, 7],
    [MachineStatus.PAUSE, 7],
    [MachineStatus.SEWING_COMPLETE, 8],
    [MachineStatus.MASK_TRACE_COMPLETE, 6],
  ] as const)("follows live state %s to step %s", (status, step) => {
    expect(getCurrentStep(status, true, false, true)).toBe(step);
  });

  it("offers file selection when the machine has no pattern", () => {
    expect(getCurrentStep(MachineStatus.IDLE, true, false, false)).toBe(3);
  });
});
