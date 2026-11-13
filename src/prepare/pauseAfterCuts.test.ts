import { afterEach, describe, expect, it } from "vitest";
import { encodeStitchesToPen } from "../formats/pen/encoder";
import { decodePenData } from "../formats/pen/decoder";
import { MOVE, STITCH, TRIM } from "../formats/import/constants";
import {
  calculateColorBlocks,
  classifyMachineStop,
} from "../utils/colorBlockHelpers";
import { getNextStep } from "../guide/nextStep";
import { stitchAction, threadFocus } from "../stitch/workflow";
import { MachineStatus as M } from "../types/machine";
import { StitchEngine } from "../studio/engine.js";
import { studioDesignToPattern } from "../studio/toPattern";
import { preparePattern } from "./preparePattern";
import { playbackStats } from "./playback";
import { usePrepareOptions } from "./prepareOptions";

const { GRID, PEC } = StitchEngine;

/** Thread 5: two lines 20 mm apart (a long jump, so a cut). Then thread 37: one line. */
function design() {
  const plan = StitchEngine.plan(
    {
      labels: new Uint8Array(GRID * GRID),
      order: [],
      lines: [
        {
          kind: "run",
          color: 5,
          pts: [
            [20, 40, 0],
            [30, 40, 0],
          ],
        },
        {
          kind: "run",
          color: 5,
          pts: [
            [50, 40, 0],
            [60, 40, 0],
          ],
        },
        {
          kind: "run",
          color: 37,
          pts: [
            [20, 60, 0],
            [60, 60, 0],
          ],
        },
      ],
    },
    {},
  );
  const { stream, colors } = StitchEngine.toStream(plan);
  return studioDesignToPattern({
    name: "pauses",
    stitches: StitchEngine.toRespiraStitches(stream),
    threads: colors.map((c: number) => ({
      index: c,
      name: PEC[c][3],
      rgb: [PEC[c][0], PEC[c][1], PEC[c][2]] as [number, number, number],
    })),
  }).data;
}

afterEach(() => usePrepareOptions.setState({ pauseAfterCuts: false }));

describe("encoder: pause after each thread cut", () => {
  const stitches = [
    [0, 0, STITCH, 0],
    [20, 0, STITCH, 0],
    [200, 0, MOVE, 0],
    [200, 0, STITCH, 0],
    [220, 0, STITCH, 0],
  ];

  it("is off unless asked for: one cut, on the jump, and no stop", () => {
    const result = encodeStitchesToPen(stitches);
    const decoded = decodePenData(new Uint8Array(result.penBytes));
    expect(result.trimStops).toEqual([]);
    expect(decoded.stitches.filter((s) => s.isCut)).toHaveLength(1);
    expect(decoded.stitches.find((s) => s.isCut)).toMatchObject({
      x: 200,
      isFeed: true,
    });
    expect(decoded.stitches.some((s) => s.isColorEnd)).toBe(false);
  });

  it("turns the cut into a cut-and-pause where the thread ends, then jumps without a second cut", () => {
    const result = encodeStitchesToPen(stitches, { stopAfterTrim: true });
    const decoded = decodePenData(
      new Uint8Array(result.penBytes),
      result.trimStops,
    );
    expect(result.trimStops).toHaveLength(1);
    const at = result.trimStops[0];
    // The same record a color change uses: COLOR_END with CUT, at the last sewn point.
    expect(decoded.stitches[at]).toMatchObject({
      x: 20,
      y: 0,
      isColorEnd: true,
      isCut: true,
      isFeed: false,
    });
    expect(decoded.stitches[at + 1]).toMatchObject({
      x: 200,
      isFeed: true,
      isCut: false,
    });
    expect(decoded.stitches.filter((s) => s.isCut)).toHaveLength(1);
    // Lock stitches still tie the thread off before the cut and tie it in after the jump.
    for (const s of decoded.stitches.slice(at - 8, at))
      expect(Math.abs(s.x - 20)).toBeLessThanOrEqual(2);
    for (const s of decoded.stitches.slice(at + 2, at + 10))
      expect(Math.abs(s.x - 200)).toBeLessThanOrEqual(2);
  });

  it("pauses at a requested short cut too, and never right before a thread change", () => {
    const short = [
      [0, 0, STITCH, 0],
      [20, 0, STITCH, 0],
      [30, 0, MOVE | TRIM, 0],
      [30, 0, STITCH, 0],
      [50, 0, STITCH, 0],
    ];
    expect(
      encodeStitchesToPen(short, { stopAfterTrim: true }).trimStops,
    ).toHaveLength(1);

    const beforeColor = [
      [0, 0, STITCH, 0],
      [20, 0, STITCH, 0],
      [200, 0, MOVE, 0],
      [200, 0, STITCH, 1],
      [220, 0, STITCH, 1],
    ];
    expect(
      encodeStitchesToPen(beforeColor, { stopAfterTrim: true }).trimStops,
    ).toEqual([]);
  });

  it("keeps a pause from being read as a new thread", () => {
    const result = encodeStitchesToPen(stitches, { stopAfterTrim: true });
    const bytes = new Uint8Array(result.penBytes);
    // Decoded blind, the pause looks like a thread change; with the stops it is one block.
    expect(decodePenData(bytes).colorBlocks).toHaveLength(2);
    const decoded = decodePenData(bytes, result.trimStops);
    expect(decoded.colorBlocks).toHaveLength(1);
    expect(decoded.trimStops).toEqual(result.trimStops);
  });
});

describe("a prepared design with pauses", () => {
  it("leaves the design untouched while the option is off", () => {
    const data = design();
    expect(preparePattern(data, { x: 0, y: 0 }, 0).data).toBe(data);
  });

  it("adds one pause per same-thread cut, keeps the threads, the place in the hoop and every needle point", () => {
    const data = design();
    const plain = preparePattern(data, { x: 3, y: 4 }, 0, false);
    const paused = preparePattern(data, { x: 3, y: 4 }, 0, true);
    const before = playbackStats(plain.data.penStitches);
    const after = playbackStats(paused.data.penStitches);

    expect(after.pauses).toBe(1); // the 20 mm gap; the thread change needs none
    expect(after.colors).toBe(before.colors);
    expect(after.cuts).toBe(before.cuts);
    expect(after.needlePoints).toBe(before.needlePoints);
    expect(paused.offset).toEqual(plain.offset);
    expect(paused.data.bounds).toEqual(data.bounds);
    expect(paused.data.threads).toEqual(data.threads);
  });

  it("follows the Prepare switch when no choice is passed, which is how upload calls it", () => {
    const data = design();
    usePrepareOptions.setState({ pauseAfterCuts: true });
    expect(
      preparePattern(data, { x: 0, y: 0 }, 0).data.penStitches.trimStops,
    ).toHaveLength(1);
  });

  it("keeps the pause through a rotation", () => {
    const rotated = preparePattern(design(), { x: 0, y: 0 }, 90, true);
    expect(rotated.data.penStitches.trimStops).toHaveLength(1);
    expect(rotated.data.penStitches.colorBlocks).toHaveLength(2);
  });
});

describe("what the app says at a pause", () => {
  const paused = preparePattern(design(), { x: 0, y: 0 }, 0, true).data;
  const blocks = calculateColorBlocks(paused);
  const pause = paused.penStitches.trimStops![0];
  const change = blocks[0].endStitch;
  const base = {
    isConnected: true,
    machineStatus: M.COLOR_CHANGE_WAIT,
    machineError: undefined,
    hasPattern: true,
    patternUploaded: true,
    isUploading: false,
    colorBlocks: blocks,
    trimStops: paused.penStitches.trimStops,
  };

  it("tells a pause from a real thread change by the stop the machine has reached", () => {
    expect(
      classifyMachineStop(blocks, pause, paused.penStitches.trimStops).kind,
    ).toBe("trim");
    expect(
      classifyMachineStop(blocks, change, paused.penStitches.trimStops).kind,
    ).toBe("color");
  });

  it("asks to hold the thread end and keep the same thread at a pause", () => {
    const step = getNextStep({ ...base, currentStitch: pause })!;
    expect(step.title).toMatch(/Hold the thread end/);
    expect(step.lines.join(" ")).toMatch(/no thread change/);
    expect(step.needsPerson).toBe(true);
    expect(
      stitchAction({
        connected: true,
        status: M.COLOR_CHANGE_WAIT,
        error: undefined,
        hasPattern: true,
        uploaded: true,
        uploading: false,
        deleting: false,
        current: pause,
        total: paused.penStitches.stitches.length,
        pausedAfterCut: true,
      }).label,
    ).toMatch(/Hold the thread end/);
    expect(threadFocus(blocks, M.COLOR_CHANGE_WAIT, pause, true).label).toBe(
      "Current thread",
    );
  });

  it("still asks for the next thread at the real thread change", () => {
    const step = getNextStep({ ...base, currentStitch: change })!;
    expect(step.title).toMatch(/^Change the thread to/);
    expect(threadFocus(blocks, M.COLOR_CHANGE_WAIT, change, false).label).toBe(
      "Load now",
    );
  });
});
