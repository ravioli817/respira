import type { PesPatternData } from "../formats/import/pesImporter";
import { decodePenData } from "../formats/pen/decoder";
import { preparePattern } from "./preparePattern";
/** Final width/height in mm, including encoded travel and locks; never changes stored geometry. */
export function patternDimensions(pattern: PesPatternData, rotation = 0) {
  const { data } = preparePattern(pattern, { x: 0, y: 0 }, rotation);
  const decoded = decodePenData(data.penData);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const s of decoded.stitches) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y);
    if (s.isDataEnd) break;
  }
  return { width: (maxX - minX) / 10, height: (maxY - minY) / 10 };
}
export function formatPatternDimensions(pattern: PesPatternData, rotation = 0) {
  const { width, height } = patternDimensions(pattern, rotation);
  return `${width.toFixed(1)} × ${height.toFixed(1)} mm`;
}
