import { afterEach, beforeEach, expect, it } from "vitest";
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

beforeEach(() => {
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

it("treats a job known only from the machine's status as a job (pattern details still being read back)", () => {
  useMachineStore.setState({ patternInfo: null, machineStatus: M.SEWING });
  useMachineStore.setState({ machineStatus: M.SEWING_COMPLETE });
  expect(useJobState.getState().finished).toBe(true);
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
