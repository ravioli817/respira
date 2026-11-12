import type { DecodedPenData } from "../formats/pen/types";
export interface DensityCell {
  key: string;
  x: number;
  y: number;
  count: number;
  density: number;
  blocks: number[];
}
export function analyzeDensity(
  data: DecodedPenData,
  {
    cellMm = 2,
    block = -1,
    shiftX = 0,
    shiftY = 0,
  }: { cellMm?: number; block?: number; shiftX?: number; shiftY?: number } = {},
) {
  if (![1, 2, 5].includes(cellMm) || ![shiftX, shiftY].every(Number.isFinite))
    throw new Error("Invalid density grid.");
  const grid = new Map<
    string,
    { x: number; y: number; count: number; blocks: Set<number> }
  >();
  let currentBlock = 0,
    total = 0,
    shortSegments = 0,
    repeatedPoints = 0;
  let previous: { x: number; y: number; index: number } | null = null;
  for (let i = 0; i < data.stitches.length; i++) {
    const s = data.stitches[i];
    const needle = !s.isFeed && !s.isCut && !s.isColorEnd;
    if (needle && (block === -1 || block === currentBlock)) {
      total++;
      const x = s.x / 10 + shiftX,
        y = s.y / 10 + shiftY;
      const gx = Math.floor(x / cellMm),
        gy = Math.floor(y / cellMm),
        key = `${gx},${gy}`;
      let cell = grid.get(key);
      if (!cell) {
        cell = { x: gx * cellMm, y: gy * cellMm, count: 0, blocks: new Set() };
        grid.set(key, cell);
      }
      cell.count++;
      cell.blocks.add(currentBlock);
      if (previous?.index === i - 1) {
        const distance = Math.hypot(x - previous.x, y - previous.y);
        if (distance < 0.3 - 1e-8) shortSegments++;
        if (distance < 1e-8) repeatedPoints++;
      }
      previous = { x, y, index: i };
    } else previous = null;
    if (s.isColorEnd) currentBlock++;
    if (s.isDataEnd) break;
  }
  const cells: DensityCell[] = [...grid].map(([key, c]) => ({
    key,
    x: c.x,
    y: c.y,
    count: c.count,
    density: c.count / (cellMm * cellMm),
    blocks: [...c.blocks],
  }));
  cells.sort((a, b) => b.density - a.density || a.y - b.y || a.x - b.x);
  return {
    cells,
    total,
    shortSegments,
    repeatedPoints,
    peak: cells[0]?.density || 0,
    cellMm,
  };
}
export function densityColor(density: number, cutoff: number) {
  return density >= cutoff
    ? "#dc2626"
    : density >= cutoff / 2
      ? "#f59e0b"
      : density >= cutoff / 4
        ? "#22c55e"
        : "#3b82f6";
}
