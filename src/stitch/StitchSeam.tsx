import type { ColorBlock } from "../components/ProgressMonitor/types";

/** Dashes across the seam, and their geometry in the drawing's own units. */
const DASHES = 29;
const STEP = 16;
const DASH = 10;
const WIDTH = 5 + STEP * (DASHES - 1) + DASH + 5;

/**
 * Progress drawn as a line of stitches: each dash takes the colour of the thread that sews that
 * part of the design, thick once stitched and thin while still to come, with the needle between.
 */
export function StitchSeam({
  blocks,
  current,
  total,
}: {
  blocks: ColorBlock[];
  current: number;
  total: number;
}) {
  const fraction = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
  // A started job shows at least one stitch; only a finished one shows them all.
  let done = Math.round(fraction * DASHES);
  if (current > 0 && done === 0) done = 1;
  if (fraction < 1 && done === DASHES) done = DASHES - 1;
  const colorAt = (index: number) => {
    const stitch = ((index + 0.5) / DASHES) * total;
    const block =
      blocks.find((b) => stitch <= b.endStitch) ?? blocks[blocks.length - 1];
    return block?.threadHex ?? "currentColor";
  };
  return (
    <svg
      role="img"
      aria-label={`Sewing progress: ${Math.round(fraction * 100)}% stitched`}
      viewBox={`0 0 ${WIDTH} 28`}
      className="block w-full h-auto"
    >
      {Array.from({ length: DASHES }, (_, index) => {
        const stitched = index < done;
        const height = stitched ? 8 : 3.5;
        return (
          <rect
            key={index}
            x={5 + STEP * index}
            y={14 - height / 2}
            width={DASH}
            height={height}
            rx={Math.min(height / 2, 2.5)}
            fill={colorAt(index)}
            stroke="currentColor"
            strokeOpacity={stitched ? 0.5 : 0.35}
            strokeWidth={0.75}
          />
        );
      })}
      {done < DASHES && (
        <path
          d={`M${5 + STEP * done - 3} 3v22`}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
