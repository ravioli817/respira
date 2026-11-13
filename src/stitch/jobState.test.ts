import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMachineStore } from "../stores/useMachineStore";
import { MachineStatus as M } from "../types/machine";
import { useJobState, watchJob } from "./jobState";
import { getNextStep } from "../guide/nextStep";

const initial = useMachineStore.getState();
const info = {
  totalStitches: 100,
  totalTime: 60,
  speed: 400,
  boundLeft: 0,
  boundRight: 60,
  boundTop: 0,
  boundBottom: 60,
};
let stop: () => void;
let getSewingProgress: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getSewingProgress = vi.fn().mockResolvedValue({
    currentStitch: 100,
    currentTime: 60,
    stopTime: 0,
    positionX: 0,
    positionY: 0,
  });
  useJobState.setState({ finished: false });
  useMachineStore.setState({
    ...initial,
    isConnected: true,
    patternInfo: info,
    machineStatus: M.SEWING,
    sewingProgress: {
      currentStitch: 93,
      currentTime: 55,
      stopTime: 0,
      positionX: 0,
      positionY: 0,
    },
    service: { getSewingProgress } as never,
  });
  stop = watchJob();
});
afterEach(() => {
  stop();
  useMachineStore.setState(initial);
});

it("remembers that the machine finished, through the idle state that follows", () => {
  useMachineStore.setState({ machineStatus: M.SEWING_COMPLETE });
  expect(useJobState.getState().finished).toBe(true);
  useMachineStore.setState({ machineStatus: M.IDLE });
  expect(useJobState.getState().finished).toBe(true);
});

it("forgets it once the job is deleted, sewn again or the machine disconnects", () => {
  useMachineStore.setState({ machineStatus: M.SEWING_COMPLETE });
  useMachineStore.setState({ machineStatus: M.IDLE, patternInfo: null });
  expect(useJobState.getState().finished).toBe(false);

  useMachineStore.setState({ patternInfo: info });
  useMachineStore.setState({ machineStatus: M.SEWING_COMPLETE });
  useMachineStore.setState({ machineStatus: M.SEWING });
  expect(useJobState.getState().finished).toBe(false);

  useMachineStore.setState({ machineStatus: M.SEWING_COMPLETE });
  useMachineStore.setState({ isConnected: false });
  expect(useJobState.getState().finished).toBe(false);
});

it("reads the stitch count once more when the machine stops for a thread change or at the end", async () => {
  useMachineStore.setState({ machineStatus: M.COLOR_CHANGE_WAIT });
  expect(getSewingProgress).toHaveBeenCalledTimes(1);
  await vi.waitFor(() =>
    expect(useMachineStore.getState().sewingProgress?.currentStitch).toBe(100),
  );
  // The same status arriving again on the next poll does not ask twice.
  useMachineStore.setState({ machineStatus: M.COLOR_CHANGE_WAIT });
  expect(getSewingProgress).toHaveBeenCalledTimes(1);
  useMachineStore.setState({ machineStatus: M.SEWING });
  useMachineStore.setState({ machineStatus: M.SEWING_COMPLETE });
  expect(getSewingProgress).toHaveBeenCalledTimes(2);
});

it("keeps a failed extra reading out of the error banner", async () => {
  getSewingProgress.mockRejectedValue(new Error("link dropped"));
  useMachineStore.setState({ machineStatus: M.COLOR_CHANGE_WAIT });
  await Promise.resolve();
  await Promise.resolve();
  expect(useMachineStore.getState().error).toBeNull();
});

it("tells the guide a finished job is ready to clear, not to trace again", () => {
  const input = {
    isConnected: true,
    machineStatus: M.IDLE,
    machineError: undefined,
    hasPattern: true,
    patternUploaded: true,
    isUploading: false,
    currentStitch: 93,
    colorBlocks: [],
  };
  expect(getNextStep(input)?.title).toMatch(/Trace outline/);
  expect(getNextStep({ ...input, finished: true })?.title).toBe(
    "Ready for a new design",
  );
});
