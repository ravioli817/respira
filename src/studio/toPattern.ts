/**
 * Turns a design made on the Create screen into the pattern data the rest of Respira works with,
 * the same shape a loaded PES file ends up in (see formats/import/client.ts). Nothing here is new
 * machine logic: the stitches go through Respira's own PEN encoder.
 */
import { encodeStitchesToPen } from "../formats/pen/encoder";
import { decodePenData } from "../formats/pen/decoder";
import { enhanceThreadWithBrotherColor } from "../utils/brotherColors";
import type { PesPatternData } from "../formats/import/pesImporter";
import type { StudioDesign } from "./studioApp.js";

export interface StudioPattern {
  data: PesPatternData;
  /** Middle of the design in 0.1 mm from the hoop's centre: where it was drawn. */
  center: { x: number; y: number };
}

function toHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function studioDesignToPattern(design: StudioDesign): StudioPattern {
  if (design.stitches.length === 0) {
    throw new Error("This design has nothing to stitch.");
  }

  const { penBytes, bounds } = encodeStitchesToPen(design.stitches);
  const penData = new Uint8Array(penBytes);
  const penStitches = decodePenData(penData);

  const threads = design.threads.map((thread) => {
    const [r, g, b] = thread.rgb;
    const enhanced = enhanceThreadWithBrotherColor(
      {
        color: (r << 16) | (g << 8) | b,
        hex: toHex(thread.rgb),
        brand: null,
        catalogNumber: null,
        description: thread.name,
        chart: null,
      },
      { matchByRGB: true },
    );
    return {
      color: (r << 16) | (g << 8) | b,
      hex: enhanced.hex,
      brand: enhanced.brand,
      catalogNumber: enhanced.catalogNumber,
      description: enhanced.description,
      chart: enhanced.chart,
    };
  });

  const uniqueColors: PesPatternData["uniqueColors"] = [];
  threads.forEach((thread, idx) => {
    const existing = uniqueColors.find((c) => c.hex === thread.hex);
    if (existing) {
      existing.threadIndices.push(idx);
    } else {
      uniqueColors.push({ ...thread, threadIndices: [idx] });
    }
  });

  return {
    data: {
      stitches: design.stitches,
      threads,
      uniqueColors,
      penData,
      penStitches,
      colorCount: threads.length,
      stitchCount: design.stitches.length,
      bounds,
    },
    center: {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    },
  };
}
