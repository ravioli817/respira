import { describe, expect, it } from "vitest";
import {
  MOST_CHOICES,
  applyChoices,
  choose,
  forgetThreads,
  matchChoices,
  skipsFromSaved,
} from "./pictureChoices.js";

/** Colours of a picture as worked out from its settings: each with its automatic thread. */
const worked = (...list) =>
  list.map(([rgb, auto], i) => ({ id: i + 1, rgb, auto, area: 100 - i }));
const threads = (clusters) => clusters.map((c) => (c.on ? c.thread : "skip"));

const WALL = [120, 137, 155],
  SKIN = [208, 162, 132],
  TOP = [124, 47, 58],
  HAIR = [74, 58, 50];
const four = () => worked([WALL, 32], [SKIN, 35], [TOP, 49], [HAIR, 23]);
// The same picture with its background kept: the top and the hair have run together.
const merged = () => worked([[244, 241, 234], 29], [WALL, 32], [SKIN, 35], [[103, 52, 55], 49]);

describe("choices made by hand for a picture's colours", () => {
  it("leave every colour on its automatic thread when there are none", () => {
    expect(threads(applyChoices(four(), []))).toEqual([32, 35, 49, 23]);
    expect(four().map(() => false)).toEqual(
      applyChoices(four(), []).map((c) => c.picked),
    );
  });

  it("stay with their colour whatever order the colours come in", () => {
    let clusters = applyChoices(four(), []);
    const choices = choose([], clusters, clusters[3], { thread: 24 });
    expect(choices).toEqual([{ rgb: HAIR, thread: 24 }]);
    expect(threads(applyChoices(four(), choices))).toEqual([32, 35, 49, 24]);
    clusters = applyChoices(four().reverse(), choices);
    expect(threads(clusters)).toEqual([24, 49, 35, 32]);
    expect(clusters.map((c) => c.picked)).toEqual([true, false, false, false]);
  });

  it("wait while their colour is absent and apply again when it is back", () => {
    const start = applyChoices(four(), []);
    const choices = choose([], start, start[0], { thread: 4 });
    // One colour for the whole picture: nothing near the wall, so the choice does nothing.
    const one = applyChoices(worked([[130, 120, 118], 39]), choices);
    expect(threads(one)).toEqual([39]);
    expect(threads(applyChoices(four(), choices))).toEqual([4, 35, 49, 23]);
  });

  it("go to the one nearest colour, never to two", () => {
    const start = applyChoices(four(), []);
    const choices = choose([], start, start[0], { thread: 4 });
    // More colours: the wall has split into a lighter and a darker blue-gray.
    const split = worked([[128, 145, 163], 32], [[110, 127, 146], 19], [SKIN, 35]);
    expect(threads(applyChoices(split, choices))).toEqual([4, 19, 35]);
    // Two choices that both sit nearest one colour: the nearer has it.
    const both = [
      { rgb: [118, 60, 60], thread: 5 },
      { rgb: [104, 53, 56], thread: 24 },
    ];
    expect(matchChoices(merged(), both)).toEqual([-1, -1, -1, 1]);
  });

  it("are replaced, not piled up, when the same colour is changed again", () => {
    let clusters = applyChoices(four(), []);
    let choices = choose([], clusters, clusters[3], { thread: 24 });
    applyChoices(clusters, choices);
    choices = choose(choices, clusters, clusters[3], { thread: 50 });
    expect(choices).toEqual([{ rgb: HAIR, thread: 50 }]);
    // Skipping is kept alongside the thread; stitching again drops only the skip.
    applyChoices(clusters, choices);
    choices = choose(choices, clusters, clusters[3], { on: false });
    expect(choices).toEqual([{ rgb: HAIR, thread: 50, on: false }]);
    expect(threads(applyChoices(clusters, choices))).toEqual([32, 35, 49, "skip"]);
    choices = choose(choices, clusters, clusters[3], { on: true });
    expect(choices).toEqual([{ rgb: HAIR, thread: 50 }]);
    // Picking the automatic thread again leaves nothing to remember.
    applyChoices(clusters, choices);
    expect(choose(choices, clusters, clusters[3], { thread: 23 })).toEqual([]);
  });

  it("never change the list they were given, so an undo step keeps what it saw", () => {
    const clusters = applyChoices(four(), []);
    const before = [{ rgb: HAIR.slice(), thread: 24 }];
    applyChoices(clusters, before);
    const after = choose(before, clusters, clusters[3], { thread: 50 });
    expect(before).toEqual([{ rgb: HAIR, thread: 24 }]);
    expect(after[0]).not.toBe(before[0]);
    expect(forgetThreads(before)).toEqual([]);
    expect(before).toHaveLength(1);
  });

  it("forget picked threads on request but keep what is skipped", () => {
    const choices = [
      { rgb: HAIR, thread: 24 },
      { rgb: TOP, thread: 5, on: false },
      { rgb: WALL, on: false },
    ];
    expect(forgetThreads(choices)).toEqual([
      { rgb: TOP, on: false },
      { rgb: WALL, on: false },
    ]);
  });

  it("stop growing: the oldest are let go first", () => {
    let choices = [];
    // Thirty colours, each well out of reach of the others.
    for (let i = 0; i < MOST_CHOICES + 6; i++) {
      const rgb = [(i % 6) * 45, Math.floor(i / 6) * 45, 0];
      const clusters = applyChoices(worked([rgb, 20]), choices);
      choices = choose(choices, clusters, clusters[0], { thread: 5 });
    }
    expect(choices).toHaveLength(MOST_CHOICES);
    expect(choices[0].rgb).toEqual([0, 45, 0]);
  });

  it("take only what was skipped from a design saved before choices were kept", () => {
    // Thread and stitch-or-skip for each colour, with no word on which threads were picked by hand.
    const saved = [
      { rgb: WALL, thread: 32, on: true },
      { rgb: SKIN, thread: 57, on: true },
      { rgb: TOP, thread: 49, on: false },
      { rgb: HAIR, thread: 23, on: true },
    ];
    const choices = skipsFromSaved(saved);
    expect(choices).toEqual([{ rgb: TOP, on: false }]);
    expect(choices[0].rgb).not.toBe(TOP);
    // The threads are matched again, so no colour is marked as picked.
    const clusters = applyChoices(four(), choices);
    expect(threads(clusters)).toEqual([32, 35, "skip", 23]);
    expect(clusters.some((c) => c.picked)).toBe(false);
  });
});
