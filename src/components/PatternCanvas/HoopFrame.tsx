import { memo, useMemo } from "react";
import { Group, Line, Rect, Text } from "react-konva";

interface HoopFrameProps {
  /** Hoop opening in 0.1 mm. */
  width: number;
  height: number;
  /** Current stage scale, so the frame and labels keep their size on screen while the hoop zooms. */
  scale: number;
  /** Preview on dark fabric. */
  dark?: boolean;
}

const FRAME = "#20242b";
const RULER = "#d6e7e1";
/** Frame thickness and label size in screen pixels. */
const RIM = 12;
const LABEL = 15;

/**
 * The hoop as it sits on the cutting mat: a dark frame, the fabric inside it, and a ruler along the
 * top. Drawn as the outside of the opening only; `HoopFabric` paints what goes inside, so a photo of
 * the real fabric can sit between the two.
 */
export const HoopFrame = memo(({ width, height, scale }: HoopFrameProps) => {
  const left = -width / 2;
  const top = -height / 2;
  const rim = RIM / scale;
  const label = LABEL / scale;
  const marks = [
    { x: left, text: "0", align: "left" as const },
    { x: 0, text: `${width / 200} cm`, align: "center" as const },
    { x: left + width, text: `${width / 100} cm`, align: "right" as const },
  ];
  const box = 120 / scale;
  return (
    <Group name="hoop-frame" listening={false}>
      <Rect
        x={left - rim}
        y={top - rim}
        width={width + 2 * rim}
        height={height + 2 * rim}
        cornerRadius={26 / scale}
        fill={FRAME}
        shadowColor="#081c18"
        shadowBlur={30}
        shadowOffsetY={10}
        shadowOpacity={0.45}
      />
      {marks.map((mark) => (
        <Text
          key={mark.text}
          x={
            mark.align === "left"
              ? mark.x
              : mark.align === "center"
                ? mark.x - box / 2
                : mark.x - box
          }
          y={top - rim - label * 1.75}
          width={box}
          align={mark.align}
          text={mark.text}
          fontSize={label}
          fontFamily='"Atkinson Hyperlegible", system-ui, sans-serif'
          fill={RULER}
        />
      ))}
    </Group>
  );
});
HoopFrame.displayName = "HoopFrame";

/** The fabric inside the hoop. */
export const HoopFabric = memo(
  ({ width, height, scale, dark = false }: HoopFrameProps) => (
    <Rect
      name="hoop-fabric"
      listening={false}
      x={-width / 2}
      y={-height / 2}
      width={width}
      height={height}
      cornerRadius={14 / scale}
      fill={dark ? "#1b1f24" : "#fbfbf8"}
    />
  ),
);
HoopFabric.displayName = "HoopFabric";

/** A faint centimetre grid on the fabric and dashed lines through the middle of the hoop. */
export const HoopGuides = memo(
  ({ width, height, dark = false }: HoopFrameProps) => {
    const lines = useMemo(() => {
      const left = -width / 2;
      const top = -height / 2;
      const result: number[][] = [];
      for (let x = left + 100; x < left + width - 1; x += 100)
        if (x !== 0) result.push([x, top, x, top + height]);
      for (let y = top + 100; y < top + height - 1; y += 100)
        if (y !== 0) result.push([left, y, left + width, y]);
      return result;
    }, [width, height]);
    const grid = dark ? "#2c343b" : "#e9edeb";
    const middle = dark ? "#55616a" : "#c3cbc7";
    return (
      <Group name="hoop-guides" listening={false}>
        {lines.map((points, i) => (
          <Line
            key={i}
            points={points}
            stroke={grid}
            strokeWidth={1}
            strokeScaleEnabled={false}
          />
        ))}
        <Line
          points={[0, -height / 2, 0, height / 2]}
          stroke={middle}
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[4, 6]}
        />
        <Line
          points={[-width / 2, 0, width / 2, 0]}
          stroke={middle}
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[4, 6]}
        />
      </Group>
    );
  },
);
HoopGuides.displayName = "HoopGuides";
