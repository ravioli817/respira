import { describe, expect, it } from "vitest";
import { parsePes, stitchFileDesign } from "./pesImport.js";
import { StitchEngine as E } from "./engine.js";
import { composePlans, transformDesign } from "./composition.js";
import { encodeStitchesToPen } from "../formats/pen/encoder";
import { decodePenData } from "../formats/pen/decoder";
import { preparePattern } from "../prepare/preparePattern";
import { studioDesignToPattern } from "./toPattern";

// A standards-shaped bare PEC fixture independent of our PES writer.
export function pecFixture(commands, slots = [5]) {
  const data = [];
  const coordinate = (v, flags) => {
    if (!flags && v >= -64 && v <= 63) data.push(v & 127);
    else data.push(0x80 | flags | ((v & 4095) >> 8), v & 255);
  };
  for (const [x, y, kind = "stitch"] of commands) {
    if (kind === "stop") {
      data.push(0xfe, 0xb0, 2);
      continue;
    }
    const flags = kind === "trim" ? 0x20 : kind === "jump" ? 0x10 : 0;
    coordinate(x, flags);
    coordinate(y, flags);
  }
  data.push(255);
  const bytes = new Uint8Array(8 + 532 + data.length);
  bytes.set(new TextEncoder().encode("#PEC0001"));
  bytes[8 + 48] = slots.length - 1;
  bytes.set(slots, 8 + 49);
  const length = 20 + data.length;
  bytes.set([length & 255, (length >> 8) & 255, (length >> 16) & 255], 8 + 514);
  bytes.set(data, 8 + 532);
  return bytes;
}
const build = (bytes) => {
  const source = parsePes(bytes);
  const plan = E.plan(stitchFileDesign(source));
  const stream = E.toStream(composePlans([plan]));
  const rows = E.toRespiraStitches(stream.stream);
  return { source, plan, stream, rows };
};
const decoded = (rows) =>
  decodePenData(new Uint8Array(encodeStitchesToPen(rows).penBytes));

describe("PES layer command preservation", () => {
  it("keeps a half-millimeter trim rather than sewing a connector", () => {
    const { rows, source } = build(
      pecFixture([
        [0, 0],
        [10, 0],
        [5, 0, "trim"],
        [10, 0],
      ]),
    );
    expect(source.paths[1].trimBefore).toBe(true);
    expect(rows.filter((p) => p[2] === 0x30)).toHaveLength(1);
    expect(decoded(rows).stitches.filter((p) => p.isCut)).toHaveLength(1);
    expect(rows.filter((p) => p[2] === 0)).toHaveLength(source.stitches);
  });
  it("keeps a jump without a requested cut as travel, even across a short gap", () => {
    const { rows, stream } = build(
      pecFixture([
        [0, 0],
        [10, 0],
        [5, 0, "jump"],
        [10, 0],
      ]),
    );
    expect(rows.filter((p) => p[2] === 0x10)).toHaveLength(1);
    expect(decoded(rows).stitches.filter((p) => p.isCut)).toHaveLength(0);
    const exported = parsePes(E.writePES(stream.stream, stream.colors, "jump"));
    expect(exported.paths.some((p) => p.jump)).toBe(true);
    expect(exported.paths.some((p) => p.trimBefore)).toBe(false);
  });
  it("keeps same-color stops through composition, recoloring, export and Prepare rotation", () => {
    const source = parsePes(
      pecFixture(
        [
          [0, 0],
          [10, 0],
          [0, 0, "stop"],
          [0, 0],
          [10, 0],
        ],
        [5, 5],
      ),
    );
    source.slots = [2, 2];
    const design = transformDesign(stitchFileDesign(source), {
      x: 4,
      y: 2,
      scale: 1.2,
      rotation: 30,
    });
    const plan = composePlans([E.plan(design)]),
      stream = E.toStream(plan),
      rows = E.toRespiraStitches(stream.stream);
    expect(stream.colors).toEqual([2, 2]);
    expect(decoded(rows).colorBlocks).toHaveLength(2);
    const exported = parsePes(
      E.writePES(stream.stream, stream.colors, "repeat"),
    );
    expect(exported.slots).toEqual([2, 2]);
    expect(exported.paths.map((p) => p.slot)).toContain(1);
    const pattern = studioDesignToPattern({
      name: "repeat",
      stitches: rows,
      threads: stream.colors.map((index) => ({
        index,
        name: "Blue",
        rgb: [10, 85, 163],
      })),
    }).data;
    for (const angle of [0, 45, 90])
      expect(
        preparePattern(pattern, { x: 0, y: 0 }, angle, false).data.penStitches
          .colorBlocks,
      ).toHaveLength(2);
  });
  it("does not resample short/long stitches or drop duplicate needle points and single-point runs", () => {
    const { rows, source } = build(
      pecFixture(
        [
          [0, 0],
          [1, 0],
          [0, 0],
          [100, 0],
          [0, 0, "stop"],
          [0, 0],
        ],
        [5, 2],
      ),
    );
    expect(source.stitches).toBe(5);
    expect(rows.filter((p) => p[2] === 0)).toHaveLength(5);
    expect(rows[1][0] - rows[0][0]).toBe(1);
    expect(rows[2].slice(0, 2)).toEqual(rows[1].slice(0, 2));
    expect(rows[3][0] - rows[2][0]).toBe(100);
  });
  it("ends a terminal cut/jump without sewing starting locks after the cut or adding a pause", () => {
    const { rows } = build(
      pecFixture([
        [0, 0],
        [10, 0],
        [0, 0, "trim"],
      ]),
    );
    for (const stopAfterTrim of [false, true]) {
      const encoded = encodeStitchesToPen(rows, { stopAfterTrim });
      const data = decodePenData(
        new Uint8Array(encoded.penBytes),
        encoded.trimStops,
      );
      expect(data.stitches.at(-1).isDataEnd).toBe(true);
      expect(data.stitches.at(-1).isCut).toBe(true);
      expect(data.trimStops || []).toHaveLength(0);
      expect(data.stitches.filter((s) => s.isDataEnd)).toHaveLength(1);
    }
  });
  it("refuses truncated input and empty thread sections instead of silently deleting controls", () => {
    const good = pecFixture([
      [0, 0],
      [10, 0],
    ]);
    expect(() => parsePes(good.slice(0, -1))).toThrow(/incomplete/);
    expect(() =>
      parsePes(
        pecFixture(
          [
            [0, 0],
            [0, 0, "stop"],
            [0, 0, "stop"],
            [10, 0],
          ],
          [5, 5, 5],
        ),
      ),
    ).toThrow(/empty thread section/);
  });
});
