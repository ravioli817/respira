import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StitchPanel } from "./StitchPanel";
import { useMachineStore } from "../stores/useMachineStore";
import { usePatternStore } from "../stores/usePatternStore";
import { useMachineUploadStore } from "../stores/useMachineUploadStore";
import { MachineStatus as M } from "../types/machine";
import { SewingMachineError as E } from "../utils/errorCodeHelpers";
import { studioDesignToPattern } from "../studio/toPattern";
const mi = useMachineStore.getState(),
  pi = usePatternStore.getState(),
  ui = useMachineUploadStore.getState();
const data = studioDesignToPattern({
  name: "two",
  threads: [
    { index: 5, name: "red", rgb: [237, 23, 31] },
    { index: 20, name: "black", rgb: [0, 0, 0] },
  ],
  stitches: [
    [0, 0, 0, 0],
    [20, 20, 0, 0],
    [40, 40, 0, 1],
    [60, 60, 0, 1],
  ],
}).data;
const info = {
  totalStitches: data.penData.length / 4,
  totalTime: 60,
  speed: 400,
  boundLeft: 0,
  boundRight: 60,
  boundTop: 0,
  boundBottom: 60,
};
const primary = () => within(screen.getByLabelText("Next action"));
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "bluetooth", {
    configurable: true,
    value: { requestDevice: vi.fn() },
  });
  useMachineStore.setState({
    ...mi,
    isConnected: true,
    machineStatus: M.IDLE,
    machineError: E.None,
    connect: vi.fn().mockResolvedValue(undefined),
    startMaskTrace: vi.fn().mockResolvedValue(undefined),
    startSewing: vi.fn().mockResolvedValue(undefined),
    resumeSewing: vi.fn().mockResolvedValue(undefined),
  });
  usePatternStore.setState({
    ...pi,
    pesData: data,
    currentFileName: "two.pes",
  });
  useMachineUploadStore.setState({
    ...ui,
    uploadPattern: vi.fn().mockResolvedValue(undefined),
  });
});
afterEach(() => {
  cleanup();
  useMachineStore.setState(mi, true);
  usePatternStore.setState(pi, true);
  useMachineUploadStore.setState(ui, true);
  vi.unstubAllGlobals();
  delete (navigator as unknown as { bluetooth?: unknown }).bluetooth;
});
it("keeps homing physical, then offers upload and sends the existing encoded data on click", async () => {
  useMachineStore.setState({
    machineStatus: M.Initial,
    machineError: E.InitialHoopError,
  });
  render(<StitchPanel onPrepare={vi.fn()} />);
  expect(primary().queryByRole("button")).toBeNull();
  expect(primary().getByText(/Remove the hoop/)).toBeTruthy();
  expect(useMachineUploadStore.getState().uploadPattern).not.toHaveBeenCalled();
  act(() =>
    useMachineStore.setState({ machineStatus: M.IDLE, machineError: E.None }),
  );
  fireEvent.click(
    primary().getByRole("button", { name: "Upload prepared design" }),
  );
  await waitFor(() =>
    expect(
      useMachineUploadStore.getState().uploadPattern,
    ).toHaveBeenCalledOnce(),
  );
  expect(
    vi.mocked(useMachineUploadStore.getState().uploadPattern).mock.calls[0][0],
  ).toEqual(data.penData);
});
it("changes the primary action to physical Start/Stop after Start Sewing", async () => {
  useMachineStore.setState({
    patternInfo: info,
    machineStatus: M.MASK_TRACE_COMPLETE,
  });
  usePatternStore.setState({ uploadedPesData: data });
  render(<StitchPanel onPrepare={vi.fn()} />);
  fireEvent.click(primary().getByRole("button", { name: "Start Sewing" }));
  await waitFor(() =>
    expect(useMachineStore.getState().startSewing).toHaveBeenCalledOnce(),
  );
  act(() => useMachineStore.setState({ machineStatus: M.SEWING_WAIT }));
  expect(primary().queryByRole("button")).toBeNull();
  expect(primary().getByText(/Start\/Stop/)).toBeTruthy();
});
it("shows current/next threads and keeps recovery available for a thread interruption", async () => {
  useMachineStore.setState({
    patternInfo: info,
    machineStatus: M.SEWING_INTERRUPTION,
    machineError: E.UpperThreadError,
    sewingProgress: {
      currentStitch: 5,
      currentTime: 0,
      stopTime: 0,
      positionX: 0,
      positionY: 0,
    },
  });
  usePatternStore.setState({ uploadedPesData: data });
  render(<StitchPanel onPrepare={vi.fn()} />);
  expect(screen.getByText("Current thread")).toBeTruthy();
  expect(screen.getByText("Next thread")).toBeTruthy();
  expect(screen.getByText(/Recovery — adjust/)).toBeTruthy();
  fireEvent.click(primary().getByRole("button", { name: "Resume Sewing" }));
  await waitFor(() =>
    expect(useMachineStore.getState().resumeSewing).toHaveBeenCalledOnce(),
  );
});
it("does not guess machine threads from an unrelated prepared draft", () => {
  useMachineStore.setState({ patternInfo: info, machineStatus: M.SEWING });
  render(<StitchPanel onPrepare={vi.fn()} />);
  expect(screen.getByText(/Thread details are unavailable/)).toBeTruthy();
  expect(screen.queryByText("Current thread")).toBeNull();
  expect(screen.queryByText(/Stitching Red/)).toBeNull();
});
it("surfaces upload failures and allows retry without duplicate in-flight calls", async () => {
  let reject!: (error: Error) => void;
  const upload = vi.fn(
    () =>
      new Promise<void>((_resolve, r) => {
        reject = r;
      }),
  );
  useMachineUploadStore.setState({ uploadPattern: upload });
  render(<StitchPanel onPrepare={vi.fn()} />);
  const button = primary().getByRole("button", {
    name: "Upload prepared design",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(upload).toHaveBeenCalledOnce();
  await act(async () => reject(new Error("Transfer interrupted")));
  expect(screen.getByRole("alert").textContent).toContain(
    "Transfer interrupted",
  );
  expect(usePatternStore.getState().uploadedPesData).toBeNull();
  expect(
    primary().getByRole("button", { name: "Upload prepared design" }),
  ).toBeTruthy();
});
it("lets a job start from a chosen thread, and puts the position back when the choice is switched off", async () => {
  const setStitchPosition = vi.fn().mockResolvedValue(undefined);
  useMachineStore.setState({
    patternInfo: info,
    machineStatus: M.IDLE,
    setStitchPosition,
  });
  usePatternStore.setState({ uploadedPesData: data });
  render(<StitchPanel onPrepare={vi.fn()} />);
  const total = data.penStitches.stitches.length;
  const second = data.penStitches.colorBlocks[1].startStitchIndex;

  // Off by default: thread rows are plain text, nothing to tap by accident.
  expect(screen.queryByRole("button", { name: /^2\. / })).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: /chosen thread/ }));
  fireEvent.click(screen.getByRole("button", { name: /^2\. / }));
  await waitFor(() =>
    expect(setStitchPosition).toHaveBeenCalledWith(second, total),
  );

  // The machine now sits at the second thread; switching the choice off restores stitch 0.
  act(() => useMachineStore.setState({ adjustedStitchIndex: second }));
  fireEvent.click(screen.getByRole("switch", { name: /chosen thread/ }));
  await waitFor(() =>
    expect(setStitchPosition).toHaveBeenLastCalledWith(0, total),
  );
});
it("does not offer a different starting thread while the machine is sewing", () => {
  useMachineStore.setState({ patternInfo: info, machineStatus: M.SEWING });
  usePatternStore.setState({ uploadedPesData: data });
  render(<StitchPanel onPrepare={vi.fn()} />);
  expect(screen.queryByRole("switch", { name: /chosen thread/ })).toBeNull();
});
it("treats a machine that is mid-job as holding a job while its details are read back after a reconnect", () => {
  // Reconnected during a thread change: status known, pattern info not yet.
  useMachineStore.setState({
    patternInfo: null,
    machineStatus: M.COLOR_CHANGE_WAIT,
  });
  render(<StitchPanel onPrepare={vi.fn()} />);
  expect(screen.getByText(/Machine job/)).toBeTruthy();
  expect(
    screen.getByText(/Reading the job back from the machine/),
  ).toBeTruthy();
  // Not an invitation to upload the local draft over the running job.
  expect(
    primary().queryByRole("button", { name: /Upload prepared design/ }),
  ).toBeNull();
});
