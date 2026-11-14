import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMachineStore, selectPatternUploaded } from "./useMachineStore";
import { useMachineCacheStore } from "./useMachineCacheStore";
import { MachineStatus } from "../types/machine";
import type { PatternInfo } from "../types/machine";
import type { PesPatternData } from "../formats/import/pesImporter";
import { uuidToString } from "../services/PatternCacheService";

const service = useMachineStore.getState().service;
const storage = useMachineStore.getState().storageService;
const uuid = new Uint8Array(16).fill(7);
const patternInfo: PatternInfo = {
  totalStitches: 12000,
  totalTime: 1800,
  speed: 400,
  boundLeft: -200,
  boundTop: -300,
  boundRight: 200,
  boundBottom: 300,
};
const emptyInfo = { ...patternInfo, totalStitches: 0 };
const progress = {
  currentStitch: 4500,
  currentTime: 600,
  stopTime: 0,
  positionX: 123,
  positionY: -45,
};
const pesData: PesPatternData = {
  stitches: [[0, 0, 0, 0]],
  threads: [],
  uniqueColors: [],
  penData: new Uint8Array([1, 2, 3]),
  penStitches: {
    stitches: [],
    colorBlocks: [],
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  },
  colorCount: 1,
  stitchCount: 1,
  bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
};
const cached = {
  uuid: uuidToString(uuid),
  pesData,
  uploadedPesData: pesData,
  fileName: "current-print.pes",
  timestamp: 1,
  patternRotation: 90,
  patternOffset: { x: 10, y: -20 },
};

let onDisconnect: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  useMachineStore.setState(useMachineStore.getInitialState(), true);
  useMachineCacheStore.getState().clearResumeState();
  vi.spyOn(service, "connect").mockResolvedValue();
  vi.spyOn(service, "disconnect").mockResolvedValue();
  vi.spyOn(service, "getMachineInfo").mockResolvedValue({
    serialNumber: "test-pp1",
    modelNumber: "PP1",
    softwareVersion: "1",
    bluetoothVersion: 1,
    maxWidth: 1000,
    maxHeight: 1000,
    macAddress: "00:00:00:00:00:00",
  });
  vi.spyOn(service, "getMachineState").mockResolvedValue({
    status: MachineStatus.SEWING,
    error: 0,
  });
  vi.spyOn(service, "getPatternInfo").mockResolvedValue(patternInfo);
  vi.spyOn(service, "getSewingProgress").mockResolvedValue(progress);
  vi.spyOn(service, "getPatternUUID").mockResolvedValue(uuid);
  vi.spyOn(service, "getServiceCount").mockResolvedValue({
    serviceCount: 0,
    totalCount: 0,
  });
  vi.spyOn(storage, "getPatternByUUID").mockResolvedValue(null);
  vi.spyOn(service, "onDisconnect").mockImplementation((callback) => {
    onDisconnect = callback;
    return () => {};
  });
  useMachineStore.getState().initialize();
});

afterEach(() => {
  useMachineStore.getState()._stopPolling();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PP1 print recovery", () => {
  it("recovers live print status without a matching browser cache", async () => {
    const upload = vi.spyOn(service, "uploadPattern");
    const remove = vi.spyOn(service, "deletePattern");
    const move = vi.spyOn(service, "setStitchIndex");
    await useMachineStore.getState().connect();

    expect(useMachineStore.getState().patternInfo).toEqual(patternInfo);
    expect(useMachineStore.getState().sewingProgress).toEqual(progress);
    expect(selectPatternUploaded(useMachineStore.getState())).toBe(true);
    expect(useMachineCacheStore.getState().resumeAvailable).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it("retries an unavailable UUID and restores the exact cached print", async () => {
    vi.mocked(service.getPatternUUID).mockResolvedValueOnce(null);
    vi.mocked(storage.getPatternByUUID).mockResolvedValue(cached);
    await useMachineStore.getState().connect();
    expect(useMachineCacheStore.getState().resumeCheckPending).toBe(true);
    expect(useMachineStore.getState().patternInfo).toEqual(patternInfo);

    await vi.advanceTimersByTimeAsync(1000);

    expect(useMachineCacheStore.getState().resumeCheckPending).toBe(false);
    expect(useMachineCacheStore.getState().resumedPattern).toEqual({
      pesData,
      uploadedPesData: pesData,
      patternOffset: cached.patternOffset,
      patternRotation: 90,
    });
  });

  it.each(["missing", "zero"])(
    "retries %s metadata without a cached print and keeps the sewing workflow",
    async (response) => {
      if (response === "missing") {
        vi.mocked(service.getPatternInfo).mockRejectedValueOnce(
          new Error("PP1 is busy"),
        );
      } else {
        vi.mocked(service.getPatternInfo).mockResolvedValueOnce(emptyInfo);
      }
      await useMachineStore.getState().connect();
      expect(useMachineStore.getState().patternInfo).toBeNull();
      expect(selectPatternUploaded(useMachineStore.getState())).toBe(true);

      await vi.advanceTimersByTimeAsync(1000);

      expect(useMachineStore.getState().patternInfo).toEqual(patternInfo);
      expect(useMachineStore.getState().sewingProgress).toEqual(progress);
      expect(useMachineStore.getState().error).toBeNull();
    },
  );

  it("does not treat an empty idle machine as an uploaded print", async () => {
    vi.mocked(service.getMachineState).mockResolvedValue({
      status: MachineStatus.IDLE,
      error: 0,
    });
    vi.mocked(service.getPatternInfo).mockResolvedValue(emptyInfo);
    vi.mocked(service.getPatternUUID).mockResolvedValue(null);
    await useMachineStore.getState().connect();

    expect(useMachineStore.getState().patternInfo).toBeNull();
    expect(selectPatternUploaded(useMachineStore.getState())).toBe(false);
    expect(useMachineCacheStore.getState().resumeCheckPending).toBe(false);
  });

  it.each([
    MachineStatus.COLOR_CHANGE_WAIT,
    MachineStatus.SEWING_WAIT,
    MachineStatus.PAUSE,
    MachineStatus.SEWING_COMPLETE,
  ])("updates the final stitch when sewing enters state %s", async (status) => {
    await useMachineStore.getState().connect();
    vi.mocked(service.getMachineState).mockResolvedValue({ status, error: 0 });
    vi.mocked(service.getSewingProgress).mockResolvedValue({
      ...progress,
      currentStitch: 4600,
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(useMachineStore.getState().sewingProgress?.currentStitch).toBe(4600);
  });

  it("recovers after a Bluetooth disconnect with no browser cache", async () => {
    await useMachineStore.getState().connect();
    onDisconnect();
    expect(useMachineStore.getState().patternInfo).toBeNull();
    expect(useMachineStore.getState().isConnected).toBe(false);
    await useMachineStore.getState().connect();
    expect(useMachineStore.getState().patternInfo).toEqual(patternInfo);
    expect(useMachineStore.getState().sewingProgress).toEqual(progress);
    expect(selectPatternUploaded(useMachineStore.getState())).toBe(true);
  });

  it("does not revive polling when a read finishes after disconnect", async () => {
    await useMachineStore.getState().connect();
    let finishRead!: (value: { status: MachineStatus; error: number }) => void;
    vi.mocked(service.getMachineState).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRead = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    onDisconnect();
    finishRead({ status: MachineStatus.SEWING, error: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(useMachineStore.getState().pollIntervalId).toBeNull();
    expect(useMachineStore.getState().serviceCountIntervalId).toBeNull();
    expect(useMachineStore.getState().machineStatus).toBe(MachineStatus.None);
  });

  it("clears stale cached artwork when a different UUID has no match", async () => {
    vi.mocked(storage.getPatternByUUID).mockResolvedValueOnce(cached);
    await useMachineStore.getState().connect();
    expect(useMachineCacheStore.getState().resumedPattern).not.toBeNull();
    await useMachineCacheStore.getState().checkResume();
    expect(useMachineCacheStore.getState().resumedPattern).toBeNull();
  });
});

it("clears manual recovery positions on disconnect and ignores a late position response", async () => {
  await useMachineStore.getState().connect();
  let finish!: () => void;
  vi.spyOn(service, "setStitchIndex").mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  useMachineStore.setState({
    adjustedStitchIndex: 100,
    lastRolledBackError: 1,
    pausedStitchIndex: 100,
  });
  const pending = useMachineStore.getState().setStitchPosition(500);
  onDisconnect();
  finish();
  await pending;
  expect(useMachineStore.getState().adjustedStitchIndex).toBeNull();
  expect(useMachineStore.getState().pausedStitchIndex).toBeNull();
});
it("does not restore cached artwork after the connection that requested it has dropped", async () => {
  await useMachineStore.getState().connect();
  let finish!: (value: typeof cached) => void;
  vi.mocked(storage.getPatternByUUID).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = useMachineCacheStore.getState().checkResume();
  await vi.advanceTimersByTimeAsync(0);
  onDisconnect();
  finish(cached);
  await pending;
  expect(useMachineCacheStore.getState().resumedPattern).toBeNull();
  expect(useMachineCacheStore.getState().resumeCheckPending).toBe(false);
});

it("does not automatically move stitches when reconnecting to an existing interruption", async () => {
  vi.mocked(service.getMachineState).mockResolvedValue({
    status: MachineStatus.SEWING_INTERRUPTION,
    error: 7,
  });
  const move = vi.spyOn(service, "setStitchIndex").mockResolvedValue();
  await useMachineStore.getState().connect();
  await vi.advanceTimersByTimeAsync(2100);
  expect(move).not.toHaveBeenCalled();
  expect(useMachineStore.getState().pausedStitchIndex).toBe(
    progress.currentStitch,
  );
});
it("keeps the cached recovery copy if machine deletion fails", async () => {
  await useMachineStore.getState().connect();
  vi.spyOn(service, "deletePattern").mockRejectedValue(
    new Error("delete refused"),
  );
  const remove = vi.spyOn(storage, "deletePattern").mockResolvedValue();
  await useMachineStore.getState().deletePattern();
  expect(remove).not.toHaveBeenCalled();
  expect(useMachineStore.getState().patternInfo).toEqual(patternInfo);
});
import { useMachineUploadStore } from "./useMachineUploadStore";
it("reports an uploaded job accurately when saving its cache fails", async () => {
  await useMachineStore.getState().connect();
  vi.spyOn(service, "uploadPattern").mockResolvedValue(uuid);
  vi.spyOn(storage, "savePattern").mockRejectedValue(
    new Error("storage unavailable"),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(
    useMachineUploadStore
      .getState()
      .uploadPattern(pesData.penData, pesData, "job.pes"),
  ).resolves.toBeUndefined();
  expect(useMachineStore.getState().error).toMatch(/uploaded.*recovery copy/);
  expect(useMachineUploadStore.getState().isUploading).toBe(false);
});
it("ignores service-count replies from a dropped connection", async () => {
  await useMachineStore.getState().connect();
  let finish!: (value: { serviceCount: number; totalCount: number }) => void;
  vi.mocked(service.getServiceCount).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = useMachineStore.getState().refreshServiceCount();
  onDisconnect();
  finish({ serviceCount: 3, totalCount: 4 });
  await pending;
  expect(useMachineStore.getState().machineInfo).toBeNull();
});
