/** Types for the plain-JavaScript stitch engine in engine.js. */
export interface StudioPlan {
  blocks: Array<{ color: number; ops: number[][] }>;
}

export interface StudioDesignInput {
  /** GRID x GRID cells of thread index (0 = empty), row by row. */
  labels?: Uint8Array | null;
  paths?: Array<{ color: number; pts: number[][] }>;
  /** Thread indices in the order their filled areas are stitched. */
  order?: number[];
  /** Pen strokes: satin columns or running-stitch lines; points are [x mm, y mm, width mm]. */
  lines?: Array<{ kind: "satin" | "run"; color: number; pts: number[][] }>;
}

export const StitchEngine: {
  CMD: { STITCH: 0; JUMP: 1; TRIM: 2; END: 4; COLOR_CHANGE: 5 };
  /** Hoop size in mm. */
  HOOP: number;
  /** Millimetres per grid cell. */
  RES: number;
  GRID: number;
  /** Brother PEC thread chart: [r, g, b, name]; index 0 is unused. */
  PEC: Array<[number, number, number, string]>;
  plan(
    design: StudioDesignInput,
    settings?: Record<string, unknown>,
  ): StudioPlan;
  planStats(plan: StudioPlan): {
    stitches: number;
    trims: number;
    perBlock: number[];
    bounds: [number, number, number, number] | null;
    width: number;
    height: number;
  };
  /** Machine stream in 0.1 mm centred on the hoop, plus one thread index per colour block. */
  toStream(plan: StudioPlan): { stream: number[][]; colors: number[] };
  /** Rows of [x, y, command, colourIndex] as Respira's PEN encoder takes them. */
  toRespiraStitches(stream: number[][]): number[][];
  writePES(stream: number[][], colors: number[], name: string): Uint8Array;
  writeDST(stream: number[][], name: string): Uint8Array;
};
