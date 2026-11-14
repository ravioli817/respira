/** "2 mm left of the center, 3 mm below it" from an offset in 0.1 mm, hoop center at zero. */
export function describePosition(offset: { x: number; y: number }): string {
  const across = Math.round(offset.x / 10);
  const down = Math.round(offset.y / 10);
  if (!across && !down) return "In the center of the hoop";
  const side = `${Math.abs(across)} mm ${across < 0 ? "left" : "right"} of`;
  const height = `${Math.abs(down)} mm ${down < 0 ? "above" : "below"}`;
  if (!down) return `${side} the center`;
  if (!across) return `${height} the center`;
  return `${side} the center, ${height} it`;
}
