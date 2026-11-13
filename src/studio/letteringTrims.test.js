import { describe, expect, it } from "vitest";
import { EMBROIDERY_FONTS } from "./embroideryFonts.js";
import { letteringDesign } from "./lettering.js";
import { transformDesign, composePlans } from "./composition.js";
import { StitchEngine as E } from "./engine.js";
import { encodeStitchesToPen } from "../formats/pen/encoder";
import { decodePenData } from "../formats/pen/decoder";
import { studioDesignToPattern } from "./toPattern";
import { preparePattern } from "../prepare/preparePattern";

const text = {
  value: "Bharti",
  color: 2,
  heightMM: 8,
  letterSpacing: 0.5,
  lineGap: 2,
  align: "center",
};
const cuts = (rows) =>
  decodePenData(
    new Uint8Array(encodeStitchesToPen(rows).penBytes),
  ).stitches.filter((s) => s.isCut);

describe("rounded and script embroidery geometry", () => {
  for (const id of ["RoundedSatin", "ScriptSatin"]) {
    const font = EMBROIDERY_FONTS[id];
    it(`digitizes every ${id} glyph at both size limits without raster fills or invalid moves`, () => {
      expect(Object.keys(font.geometry.glyphs).length).toBe(
        id === "RoundedSatin" ? 120 : 125,
      );
      for (const char of Object.keys(font.geometry.glyphs))
        for (const heightMM of [font.min, font.max]) {
          const design = letteringDesign({
            ...text,
            font: id,
            value: char,
            heightMM,
          });
          expect(design.labels.some(Boolean)).toBe(false);
          const plan = E.plan(design);
          expect(E.planStats(plan).stitches, char).toBeGreaterThan(0);
          for (const block of plan.blocks)
            for (let i = 0; i < block.ops.length; i++) {
              const op = block.ops[i];
              expect(op.every(Number.isFinite), char).toBe(true);
              if (
                i &&
                op[2] === E.CMD.STITCH &&
                block.ops[i - 1][2] === E.CMD.STITCH
              )
                expect(
                  Math.hypot(
                    op[0] - block.ops[i - 1][0],
                    op[1] - block.ops[i - 1][1],
                  ),
                  char,
                ).toBeLessThanOrEqual(7.001);
            }
        }
    });
    it(`enforces ${id} final size and reports unsupported characters`, () => {
      expect(() =>
        letteringDesign({ ...text, font: id, heightMM: font.min - 0.1 }),
      ).toThrow(/final letter height/);
      expect(() =>
        letteringDesign({ ...text, font: id, heightMM: font.max }, 1.01),
      ).toThrow(/final letter height/);
      expect(() =>
        letteringDesign({
          ...text,
          font: id,
          heightMM: font.min,
          value: "Bharti 😀",
        }),
      ).toThrow(/😀/);
      const small = letteringDesign({ ...text, font: id, heightMM: font.min });
      const large = letteringDesign(
        { ...text, font: id, heightMM: font.min },
        1.2,
      );
      expect(large.paths.flatMap((p) => p.pts).length).toBeGreaterThan(
        small.paths.flatMap((p) => p.pts).length,
      );
    });
  }
});

describe("lettering trim rules", () => {
  it("marks only word/letter boundaries, handling spaces and newlines without changing geometry", () => {
    const source = { ...text, value: " AB  CD\n EF " };
    const auto = letteringDesign(source);
    const words = letteringDesign({ ...source, trimRule: "word" });
    const letters = letteringDesign({ ...source, trimRule: "letter" });
    expect(auto.paths.filter((p) => p.trimBefore)).toHaveLength(0);
    expect(words.paths.filter((p) => p.trimBefore)).toHaveLength(2);
    expect(letters.paths.filter((p) => p.trimBefore)).toHaveLength(5);
    expect(letters.paths.map((p) => p.pts)).toEqual(
      auto.paths.map((p) => p.pts),
    );
    expect(
      letteringDesign({ ...text, value: "   \n ", trimRule: "letter" }).paths,
    ).toHaveLength(0);
  });
  it("keeps requested cuts through object transforms, composition and Prepare rotation", () => {
    const design = transformDesign(
      letteringDesign({ ...text, value: "AB CD", trimRule: "letter" }),
      { x: 3, y: -4, scale: 1, rotation: 25 },
    );
    const plan = composePlans([E.plan(design)]);
    const stream = E.toStream(plan);
    const rows = E.toRespiraStitches(stream.stream);
    expect(rows.filter((s) => (s[2] & 0x30) === 0x30)).toHaveLength(3);
    expect(rows.some((s) => s[2] === 0x20)).toBe(false);
    const pattern = studioDesignToPattern({
      name: "letters",
      stitches: rows,
      threads: [{ index: 2, name: "Blue", rgb: [10, 85, 163] }],
    }).data;
    for (const angle of [0, 45, 90]) {
      const prepared = preparePattern(pattern, { x: 0, y: 0 }, angle).data;
      expect(
        prepared.stitches.filter((s) => (s[2] & 0x30) === 0x30),
      ).toHaveLength(3);
      expect(
        prepared.penStitches.stitches.filter((s) => s.isCut).length,
      ).toBeGreaterThanOrEqual(3);
    }
  });
  it("adds a locked cut for short and zero-distance jumps, without duplicating long-jump cuts", () => {
    const row = (distance, cmd) => [
      [0, 0, 0, 0],
      [10, 0, 0, 0],
      [10 + distance, 0, cmd, 0],
      [20 + distance, 0, 0, 0],
      [30 + distance, 0, 0, 0],
    ];
    for (const distance of [0, 10, 80]) {
      const requested = row(distance, 0x30),
        automatic = row(distance, 0x10);
      expect(cuts(requested)).toHaveLength(1);
      expect(cuts(requested)[0].isJump).toBe(true);
      expect(cuts(automatic)).toHaveLength(distance > 50 ? 1 : 0);
      const extra =
        decodePenData(new Uint8Array(encodeStitchesToPen(requested).penBytes))
          .stitches.length -
        decodePenData(new Uint8Array(encodeStitchesToPen(automatic).penBytes))
          .stitches.length;
      expect(extra).toBe(distance > 50 ? 0 : 16);
    }
  });
  it("does not create an extra cut at a color transition", () => {
    const rows = [
      [0, 0, 0, 0],
      [10, 0, 0, 0],
      [20, 0, 0x30, 1],
      [30, 0, 0, 1],
      [40, 0, 0, 1],
    ];
    expect(cuts(rows)).toHaveLength(1);
    expect(cuts(rows)[0].isColorEnd).toBe(true);
  });
  it("preserves legacy automatic trim handling while allowing a requested cut at the same point", () => {
    const stream = [
      [0, 0, E.CMD.STITCH],
      [10, 0, E.CMD.STITCH],
      [10, 0, E.CMD.TRIM],
      [10, 0, E.CMD.JUMP],
      [20, 0, E.CMD.STITCH],
    ];
    expect(E.toRespiraStitches(stream)).toEqual([
      [0, 0, 0, 0],
      [10, 0, 0, 0],
      [20, 0, 0, 0],
    ]);
    stream[2].push(1);
    expect(E.toRespiraStitches(stream)[2]).toEqual([10, 0, 0x30, 0]);
    expect(cuts(E.toRespiraStitches(stream))).toHaveLength(1);
  });
});

import { createHash } from "node:crypto";
it("keeps the prior Small Satin automatic machine bytes unchanged", () => {
  // Recorded from main fef367f before this feature, including locks and automatic cuts.
  const samples = [
    [
      "Bharti",
      "5b6fcf37507a8f6bc3f4594d524e0e874e04a5d19c99de12fb32254710c19b7f",
    ],
    [
      "AB CD\nÉté",
      "b5c89ce6c1dd5c3fe693f66b501d6ea1c18616567acea5a96d1322fd933ff56d",
    ],
  ];
  for (const [value, expected] of samples) {
    const rows = E.toRespiraStitches(
      E.toStream(E.plan(letteringDesign({ ...text, value }))).stream,
    );
    const bytes = new Uint8Array(encodeStitchesToPen(rows).penBytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(expected);
  }
});
