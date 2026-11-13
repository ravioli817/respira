import { describe, it, expect } from "vitest";
import {
  getNextStep,
  threadLabel,
  currentBlockIndex,
  upcomingBlockIndex,
  type NextStepInput,
} from "./nextStep";
import { MachineStatus } from "../types/machine";
import { SewingMachineError } from "../utils/errorCodeHelpers";
import type { ColorBlock } from "../components/ProgressMonitor/types";

const block = (
  colorIndex: number,
  startStitch: number,
  endStitch: number,
  name: string,
  code: string | null,
): ColorBlock => ({
  colorIndex,
  threadHex: "#000000",
  startStitch,
  endStitch,
  stitchCount: endStitch - startStitch,
  threadCatalogNumber: code,
  threadBrand: code ? "Brother Embroidery" : null,
  threadDescription: name,
  threadChart: code,
});

const blocks = [
  block(0, 0, 1000, "PINK", "085"),
  block(1, 1001, 1200, "YELLOW", "205"),
  block(2, 1201, 2000, "LEAF GREEN", "509"),
];

const base: NextStepInput = {
  isConnected: true,
  machineStatus: MachineStatus.IDLE,
  machineError: SewingMachineError.None,
  hasPattern: true,
  patternUploaded: true,
  isUploading: false,
  currentStitch: 0,
  colorBlocks: blocks,
};
const step = (patch: Partial<NextStepInput>) =>
  getNextStep({ ...base, ...patch })!;

describe("threadLabel", () => {
  it("names the thread the way it is printed on a Brother spool", () => {
    expect(threadLabel(blocks[2])).toBe("Leaf green (Brother #509)");
  });
  it("copes without a catalog number or a block", () => {
    expect(threadLabel(block(0, 0, 1, "TEAL", null))).toBe("Teal");
    expect(threadLabel(undefined)).toBe("the next thread");
  });
});

describe("which thread", () => {
  it("finds the block being stitched", () => {
    expect(currentBlockIndex(blocks, 0)).toBe(0);
    expect(currentBlockIndex(blocks, 999)).toBe(0);
    expect(currentBlockIndex(blocks, 1000)).toBe(0);
    expect(currentBlockIndex(blocks, 1001)).toBe(1);
    expect(currentBlockIndex(blocks, 1100)).toBe(1);
    expect(currentBlockIndex(blocks, 5000)).toBe(2);
  });
  it("picks the thread after the nearest stop, whichever side the count is on", () => {
    expect(upcomingBlockIndex(blocks, 994)).toBe(1); // a little short of the stop
    expect(upcomingBlockIndex(blocks, 1000)).toBe(1);
    expect(upcomingBlockIndex(blocks, 1002)).toBe(1); // a little past it
    expect(upcomingBlockIndex(blocks, 1199)).toBe(2);
    expect(upcomingBlockIndex(blocks, 1203)).toBe(2);
  });
});

describe("getNextStep", () => {
  it("asks to connect first", () => {
    const s = step({ isConnected: false });
    expect(s.title).toMatch(/Connect to Machine/);
    expect(s.needsPerson).toBe(false);
  });

  it("walks through homing instead of calling it an error", () => {
    const s = step({
      machineStatus: MachineStatus.Initial,
      machineError: SewingMachineError.InitialHoopError,
    });
    expect(s.tone).toBe("action");
    expect(s.lines.join(" ")).toMatch(/Take the frame off/);
    expect(s.lines.join(" ")).toMatch(/Accept/);
  });

  it("points at Create when there is no design", () => {
    expect(step({ hasPattern: false, patternUploaded: false }).title).toMatch(
      /Pick a design/,
    );
    expect(step({ patternUploaded: false }).title).toMatch(/Upload/);
  });

  it("says which machine button to press for the outline trace", () => {
    const s = step({ machineStatus: MachineStatus.MASK_TRACE_LOCK_WAIT });
    expect(s.title).toMatch(/Accept button on the machine/);
    expect(s.lines.join(" ")).toMatch(/Nothing is stitched yet/);
  });

  it("names the first thread before sewing starts", () => {
    const s = step({ machineStatus: MachineStatus.MASK_TRACE_COMPLETE });
    expect(s.title).toMatch(/Start Sewing/);
    expect(s.lines[0]).toMatch(/Pink \(Brother #085\)/);
  });

  it("says to press Start/Stop when the machine is waiting to sew", () => {
    expect(step({ machineStatus: MachineStatus.SEWING_WAIT }).title).toMatch(
      /Press the Start\/Stop button on the machine to begin/,
    );
    expect(
      step({ machineStatus: MachineStatus.SEWING_WAIT, currentStitch: 300 })
        .title,
    ).toMatch(/Paused/);
  });

  it("shows the thread being stitched and how many there are", () => {
    const s = step({
      machineStatus: MachineStatus.SEWING,
      currentStitch: 1100,
    });
    expect(s.title).toBe("Stitching Yellow (Brother #205)");
    expect(s.lines[0]).toMatch(/Thread 2 of 3/);
    expect(s.needsPerson).toBe(false);
  });

  it("calls for the next thread at a color change, and makes a sound", () => {
    const s = step({
      machineStatus: MachineStatus.COLOR_CHANGE_WAIT,
      currentStitch: 997,
    });
    expect(s.title).toBe("Change the thread to Yellow (Brother #205)");
    expect(s.lines.join(" ")).toMatch(/Start\/Stop/);
    expect(s.needsPerson).toBe(true);
  });

  it("explains a broken top thread and how to carry on", () => {
    const s = step({
      machineStatus: MachineStatus.SEWING_INTERRUPTION,
      machineError: SewingMachineError.UpperThreadError,
      currentStitch: 500,
    });
    expect(s.tone).toBe("problem");
    expect(s.title).toMatch(/Upper Thread/i);
    expect(s.lines.join(" ")).toMatch(/rethread/i);
    expect(s.lines[s.lines.length - 1]).toMatch(/Resume Sewing/);
    expect(s.needsPerson).toBe(true);
  });

  it("celebrates the finish and says how to start again", () => {
    const s = step({
      machineStatus: MachineStatus.SEWING_COMPLETE,
      currentStitch: 2000,
    });
    expect(s.tone).toBe("done");
    expect(s.lines.join(" ")).toMatch(/Delete Pattern/);
    expect(s.needsPerson).toBe(true);
  });

  it("offers the outline trace once a design is on the machine", () => {
    expect(step({ machineStatus: MachineStatus.IDLE }).title).toMatch(
      /Trace outline/,
    );
  });
});

describe("a dropped connection", () => {
  const offline = {
    isConnected: false,
    machineStatus: MachineStatus.None,
    machineError: undefined,
    hasPattern: true,
    patternUploaded: false,
    isUploading: false,
    currentStitch: 0,
    colorBlocks: [],
  };
  it("says the link dropped and that the machine keeps the job, when a design had been sent", () => {
    const step = getNextStep({ ...offline, connectionLost: true })!;
    expect(step.title).toMatch(/connection dropped/i);
    expect(step.lines.join(" ")).toMatch(/nothing is sent again/);
    expect(step.needsPerson).toBe(true);
  });
  it("keeps the plain first-connect prompt otherwise", () => {
    const step = getNextStep(offline)!;
    expect(step.title).toMatch(/^Turn on the Skitch/);
    expect(step.needsPerson).toBe(false);
  });
});

it("names the chosen starting thread, not the first one, when the start was moved", () => {
  const blocks = [
    {
      colorIndex: 0,
      threadHex: "#f00",
      startStitch: 0,
      endStitch: 100,
      stitchCount: 100,
      threadCatalogNumber: "800",
      threadBrand: "Brother",
      threadDescription: "Red",
      threadChart: null,
    },
    {
      colorIndex: 1,
      threadHex: "#00f",
      startStitch: 101,
      endStitch: 200,
      stitchCount: 100,
      threadCatalogNumber: "405",
      threadBrand: "Brother",
      threadDescription: "Blue",
      threadChart: null,
    },
  ] as ColorBlock[];
  const step = getNextStep({
    isConnected: true,
    machineStatus: MachineStatus.MASK_TRACE_COMPLETE,
    machineError: undefined,
    hasPattern: true,
    patternUploaded: true,
    isUploading: false,
    currentStitch: 101,
    colorBlocks: blocks,
  })!;
  expect(step.lines.join(" ")).toMatch(/Blue/);
  expect(step.lines.join(" ")).not.toMatch(/Red/);
});
