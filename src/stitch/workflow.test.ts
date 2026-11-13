import { expect, it } from "vitest";
import { MachineStatus as M } from "../types/machine";
import { SewingMachineError as E } from "../utils/errorCodeHelpers";
import { stitchAction, threadFocus, type WorkflowState } from "./workflow";
import { calculateColorBlocks } from "../utils/colorBlockHelpers";
import { studioDesignToPattern } from "../studio/toPattern";
const base: WorkflowState = {
  connected: true,
  status: M.IDLE,
  error: E.None,
  hasPattern: true,
  uploaded: false,
  uploading: false,
  deleting: false,
  current: 0,
  total: 100,
};
it.each([
  [{ connected: false }, "app", "connect"],
  [{ status: M.Initial }, "machine", undefined],
  [{ status: M.HOOP_AVOIDANCEING }, "wait", undefined],
  [{ status: M.None }, "wait", undefined],
  [{ hasPattern: false }, "app", "prepare"],
  [{}, "app", "upload"],
  [{ uploading: true }, "wait", undefined],
  [{ uploaded: true }, "app", "trace"],
  [{ uploaded: true, status: M.MASK_TRACE_LOCK_WAIT }, "machine", undefined],
  [{ uploaded: true, status: M.MASK_TRACING }, "wait", undefined],
  [{ uploaded: true, status: M.MASK_TRACE_COMPLETE }, "app", "start"],
  [{ uploaded: true, status: M.SEWING_WAIT }, "machine", undefined],
  [{ uploaded: true, status: M.SEWING }, "machine", undefined],
  [
    { uploaded: true, status: M.COLOR_CHANGE_WAIT, current: 50 },
    "machine",
    undefined,
  ],
  [
    {
      uploaded: true,
      status: M.SEWING_INTERRUPTION,
      error: E.UpperThreadError,
    },
    "app",
    "resume",
  ],
  [{ uploaded: true, status: M.STOP }, "machine", undefined],
  [
    { uploaded: true, status: M.SEWING_COMPLETE, current: 100 },
    "machine",
    undefined,
  ],
  [{ uploaded: true, current: 100 }, "app", "delete"],
  // The last progress reading is short of the total, but the machine said it finished.
  [{ uploaded: true, current: 97, finished: true }, "app", "delete"],
  [{ uploaded: true, current: 97 }, "app", "trace"],
  [{ error: E.HoopError }, "machine", undefined],
] as const)("chooses one safe next action for %j", (patch, kind, command) => {
  const action = stitchAction({ ...base, ...patch });
  expect(action.kind).toBe(kind);
  expect(action.command).toBe(command);
});
it("shows the thread to load at a color stop and no next thread at the end", () => {
  const { data } = studioDesignToPattern({
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
  });
  const blocks = calculateColorBlocks(data),
    boundary = blocks[0].endStitch;
  expect(threadFocus(blocks, M.IDLE, 0)).toMatchObject({
    index: 0,
    label: "Load first",
    next: blocks[1],
  });
  expect(threadFocus(blocks, M.COLOR_CHANGE_WAIT, boundary + 1)).toMatchObject({
    index: 1,
    label: "Load now",
    next: null,
  });
  expect(threadFocus(blocks, M.SEWING_COMPLETE, 1000)).toMatchObject({
    index: 1,
    label: "Last thread",
    next: null,
  });
  expect(threadFocus([], M.SEWING, 50).current).toBeNull();
});
