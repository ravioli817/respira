import { describe, expect, it } from "vitest";
import { StitchEngine as E } from "./engine.js";
import { assignThreads, rankThreads } from "./threadMatch.js";

const PEC = E.PEC;
const name = (index) => PEC[index][3];
const nearest = (rgb) => name(rankThreads(PEC, rgb)[0][0]);

describe("matching a picture's colours to threads", () => {
  it("keeps near-black black and gray gray, instead of drifting to brown or a tint", () => {
    // Plain RGB distance sent these to Dark Brown and Olive Green.
    expect(nearest([20, 20, 20])).toBe("Black");
    expect(nearest([128, 128, 128])).toBe("Gray");
    expect(nearest([245, 245, 245])).toBe("White");
  });

  it("keeps a muted colour's hue instead of giving it a gray thread", () => {
    // Plain RGB distance sent these to Dark Gray, Pewter and Warm Gray.
    expect(nearest([25, 35, 80])).toBe("Prussian Blue");
    expect(["Blue", "Electric Blue", "Cornflower Blue"]).toContain(
      nearest([70, 90, 130]),
    );
    expect(nearest([210, 190, 150])).toBe("Khaki");
  });

  it("does not send a weak tint to a thread from the other side of the colour wheel", () => {
    // Dark brown hair went to Peacock Blue (a teal), and a mid brown to Dark Olive.
    expect(nearest([74, 58, 50])).toBe("Dark Gray");
    expect(nearest([90, 70, 58])).toBe("Pewter");
    // A dark purple went to Dark Brown, a pale cyan to Lavender, a dark navy to Olive Green.
    expect(nearest([45, 0, 45])).toBe("Royal Purple");
    // (It is strengthened on the way, so it lands on the stronger of the two light blues.)
    expect(nearest([75, 180, 195])).toBe("Sky Blue");
    expect(nearest([0, 30, 45])).toBe("Prussian Blue");
  });

  it("leaves clear colours where they were", () => {
    expect(nearest([237, 23, 31])).toBe("Red");
    expect(nearest([240, 150, 180])).toBe("Pink");
    expect(nearest([150, 200, 60])).toBe("Lime Green");
  });

  it("gives each area of a muted photo its own thread", () => {
    // The six colours of a real muted photo; the old matching gave two of them Warm Gray.
    const areas = [
      { rgb: [74, 72, 80], area: 39 },
      { rgb: [197, 206, 214], area: 21 },
      { rgb: [223, 224, 210], area: 18 },
      { rgb: [239, 205, 172], area: 9 },
      { rgb: [177, 166, 163], area: 8 },
      { rgb: [147, 145, 163], area: 4 },
    ];
    const threads = assignThreads(PEC, areas);
    expect(new Set(threads).size).toBe(6);
    expect(threads.map(name)).toEqual([
      "Pewter",
      "Warm Gray",
      "White",
      "Beige",
      "Silver",
      "Lavender",
    ]);
  });

  it("keeps automatic colors distinct even when the nearest alternatives are farther away", () => {
    const threads = assignThreads(PEC, [
      { rgb: [237, 23, 31], area: 2 },
      { rgb: [236, 24, 32], area: 1 },
    ]);
    expect(name(threads[0])).toBe("Red");
    expect(new Set(threads).size).toBe(2);
  });
});
it("does not repeat Beige when more similar image regions are added", () => {
  const regions = [
    { rgb: [65, 75, 9], area: 23 },
    { rgb: [85, 90, 92], area: 16 },
    { rgb: [215, 205, 198], area: 14 },
    { rgb: [160, 220, 235], area: 13 },
    { rgb: [180, 178, 210], area: 12 },
    { rgb: [239, 227, 185], area: 10 },
    { rgb: [254, 182, 65], area: 6 },
    { rgb: [238, 226, 184], area: 6 },
  ];
  for (let count = 2; count <= 8; count++)
    expect(new Set(assignThreads(PEC, regions.slice(0, count))).size).toBe(
      count,
    );
  const names = assignThreads(PEC, regions).map(name);
  expect(names.filter((n) => n === "Beige")).toHaveLength(1);
});

describe("choosing the threads of a picture as a set", () => {
  const set = (list) =>
    assignThreads(
      PEC,
      list.map((rgb, i) => ({ rgb, area: 100 - i })),
    ).map(name);
  it("keeps the last of several similar shades in its own family of threads", () => {
    // One at a time, the light gray got Flesh Pink, the mid tan Tangerine and the mid blue Silver.
    const grays = set([20, 60, 100, 140, 190, 235].map((v) => [v, v, v]));
    expect(grays).toEqual([
      "Black",
      "Dark Gray",
      "Pewter",
      "Gray",
      "Warm Gray",
      "White",
    ]);
    const skin = set([
      [250, 225, 205],
      [240, 205, 180],
      [225, 185, 160],
      [205, 160, 135],
      [180, 135, 110],
      [150, 105, 85],
      [110, 75, 60],
      [70, 45, 38],
    ]);
    expect(new Set(skin).size).toBe(8);
    expect(skin).not.toContain("Tangerine");
    const sky = set([
      [200, 225, 245],
      [170, 205, 240],
      [140, 185, 230],
      [110, 160, 215],
      [80, 135, 195],
      [55, 105, 170],
    ]);
    expect(new Set(sky).size).toBe(6);
    expect(sky).not.toContain("Silver");
    expect(sky.slice(3)).toEqual([
      "Sky Blue",
      "Cornflower Blue",
      "Electric Blue",
    ]);
  });
  it("gives eight colors eight threads, quickly, and leaves reserved threads alone", () => {
    const grays = [20, 50, 80, 110, 140, 170, 200, 235].map((v, i) => ({
      rgb: [v, v, v],
      area: 100 - i,
    }));
    const threads = assignThreads(PEC, grays, [20, 29]);
    expect(new Set(threads).size).toBe(8);
    expect(threads).not.toContain(20);
    expect(threads).not.toContain(29);
  });
  it("strengthens an area that has a color, and leaves a weak tint as it is", () => {
    expect(nearest([124, 47, 58])).toBe("Dark Fuchsia");
    expect(nearest([210, 190, 150])).toBe("Khaki");
    expect(nearest([208, 162, 132])).toBe("Khaki");
  });
});
