import { useEffect, useMemo, useRef, useState } from "react";
import type { PesPatternData } from "../formats/import/pesImporter";
import { decodePenData } from "../formats/pen/decoder";
import { colorAt, colorBoundary, playbackStats } from "./playback";
import { Button } from "../components/ui/button";

interface Props {
  pattern: PesPatternData;
  offset: { x: number; y: number };
  hoopWidth?: number;
  hoopHeight?: number;
}
export function StitchPlayback(props: Props) {
  // Remount the controls when bytes or placement change; never continue an old animation.
  const identity = useMemo(() => {
    let hash = 2166136261;
    for (const byte of props.pattern.penData)
      hash = Math.imul(hash ^ byte, 16777619);
    return `${hash}:${props.pattern.penData.length}:${props.offset.x}:${props.offset.y}`;
  }, [props.pattern.penData, props.offset.x, props.offset.y]);
  return <PlaybackSession key={identity} {...props} />;
}
function PlaybackSession({
  pattern,
  offset,
  hoopWidth = 1000,
  hoopHeight = 1000,
}: Props) {
  const decoded = useMemo(
    () => decodePenData(pattern.penData, pattern.penStitches.trimStops),
    [pattern.penData, pattern.penStitches.trimStops],
  );
  const stats = useMemo(() => playbackStats(decoded), [decoded]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [jumps, setJumps] = useState(true),
    [cuts, setCuts] = useState(true),
    [points, setPoints] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const total = decoded.stitches.length;
  const finished = cursor >= total;
  useEffect(() => {
    if (!playing || finished) return;
    const timer = window.setInterval(
      () =>
        setCursor((n) =>
          Math.min(total, n + Math.max(1, Math.round(speed / 20))),
        ),
      50,
    );
    return () => clearInterval(timer);
  }, [playing, speed, total, finished]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", stop);
    return () => document.removeEventListener("visibilitychange", stop);
  }, []);
  useEffect(() => {
    const node = canvas.current,
      ctx = node?.getContext("2d");
    if (!ctx || !node) return;
    const w = node.width,
      margin = 32;
    // Include out-of-hoop coordinates in view so placement problems are visible.
    const centerX = (pattern.bounds.minX + pattern.bounds.maxX) / 2;
    const centerY = (pattern.bounds.minY + pattern.bounds.maxY) / 2;
    const shiftX = offset.x - centerX,
      shiftY = offset.y - centerY;
    const extent = Math.max(
      hoopWidth / 2,
      hoopHeight / 2,
      Math.abs(decoded.bounds.minX + shiftX),
      Math.abs(decoded.bounds.maxX + shiftX),
      Math.abs(decoded.bounds.minY + shiftY),
      Math.abs(decoded.bounds.maxY + shiftY),
    );
    const scale = (w - margin * 2) / (2 * extent || 1000);
    const x = (n: number) => w / 2 + (n + shiftX) * scale;
    const y = (n: number) => w / 2 + (n + shiftY) * scale;
    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      w / 2 - (hoopWidth / 2) * scale,
      w / 2 - (hoopHeight / 2) * scale,
      hoopWidth * scale,
      hoopHeight * scale,
    );
    const draw = (limit: number, ghost: boolean) => {
      // Batch stitch segments per color instead of issuing a canvas stroke per needle point.
      for (const block of decoded.colorBlocks) {
        if (block.startStitchIndex >= limit) break;
        const end = Math.min(limit, block.endStitchIndex + 1);
        ctx.strokeStyle = ghost
          ? "#cbd5e1"
          : pattern.threads[block.colorIndex]?.hex || "#111827";
        ctx.lineWidth = ghost ? 1 : 1.6;
        ctx.beginPath();
        for (let i = Math.max(1, block.startStitchIndex); i < end; i++) {
          const s = decoded.stitches[i],
            p = decoded.stitches[i - 1];
          if (s.isFeed || s.isCut || s.isColorEnd) continue;
          ctx.moveTo(x(p.x), y(p.y));
          ctx.lineTo(x(s.x), y(s.y));
        }
        ctx.stroke();
      }
      if (ghost) return;
      if (jumps) {
        ctx.strokeStyle = "#64748b";
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        for (let i = 1; i < limit; i++) {
          const s = decoded.stitches[i],
            p = decoded.stitches[i - 1];
          if (s.isFeed) {
            ctx.moveTo(x(p.x), y(p.y));
            ctx.lineTo(x(s.x), y(s.y));
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = "#dc2626";
      if (cuts)
        for (let i = 0; i < limit; i++) {
          const s = decoded.stitches[i];
          if (s.isCut) ctx.strokeRect(x(s.x) - 4, y(s.y) - 4, 8, 8);
        }
      if (points) {
        ctx.fillStyle = "#111827";
        ctx.beginPath();
        for (let i = 0; i < limit; i++) {
          const s = decoded.stitches[i];
          if (!s.isFeed && !s.isCut && !s.isColorEnd) {
            ctx.moveTo(x(s.x) + 1.8, y(s.y));
            ctx.arc(x(s.x), y(s.y), 1.8, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
    };
    draw(total, true);
    draw(cursor, false);
    const needle = decoded.stitches[Math.max(0, cursor - 1)];
    if (needle) {
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x(needle.x), y(needle.y), 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [
    decoded,
    pattern,
    offset,
    cursor,
    jumps,
    cuts,
    points,
    total,
    hoopWidth,
    hoopHeight,
  ]);
  const currentColor = colorAt(decoded, cursor),
    thread = pattern.threads[currentColor];
  const seek = (next: number) => {
    setPlaying(false);
    setCursor(Math.max(0, Math.min(total, next)));
  };
  const command = cursor ? decoded.stitches[cursor - 1] : null;
  const event = !command
    ? "Start"
    : command.isColorEnd
      ? "Color change"
      : command.isDataEnd
        ? "End"
        : command.isCut
          ? "Cut thread"
          : command.isFeed
            ? "Jump"
            : "Stitch";
  return (
    <section
      aria-label="Stitch playback"
      className="bg-white dark:bg-gray-800 border rounded-xl p-4 flex flex-col gap-3"
    >
      <div>
        <h2 className="font-bold text-lg">Stitch playback</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Preview only · does not move the machine
        </p>
      </div>
      <canvas
        ref={canvas}
        width={800}
        height={800}
        className="w-full max-h-[52dvh] object-contain rounded-lg"
        aria-label="Playback of the final machine stitches"
        role="img"
      />
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <label>
          <input
            type="checkbox"
            checked={jumps}
            onChange={(e) => setJumps(e.target.checked)}
          />{" "}
          Jumps (dashed)
        </label>
        <label>
          <input
            type="checkbox"
            checked={cuts}
            onChange={(e) => setCuts(e.target.checked)}
          />{" "}
          Cuts (red squares)
        </label>
        <label>
          <input
            type="checkbox"
            checked={points}
            onChange={(e) => setPoints(e.target.checked)}
          />{" "}
          Needle points
        </label>
      </div>
      <label className="text-sm">
        Playback position · {cursor.toLocaleString()} / {total.toLocaleString()}{" "}
        commands
        <input
          className="w-full"
          type="range"
          min={0}
          max={total}
          value={cursor}
          onChange={(e) => seek(+e.target.value)}
          aria-label="Playback position"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            if (cursor >= total) setCursor(0);
            setPlaying(!playing || cursor >= total);
          }}
        >
          {playing && cursor < total
            ? "Pause playback"
            : cursor >= total
              ? "Replay stitches"
              : "Play stitches"}
        </Button>
        <Button
          variant="outline"
          onClick={() => seek(cursor - 1)}
          disabled={!cursor}
        >
          Back 1
        </Button>
        <Button
          variant="outline"
          onClick={() => seek(cursor + 1)}
          disabled={cursor >= total}
        >
          Forward 1
        </Button>
        <Button
          variant="outline"
          onClick={() => seek(colorBoundary(decoded, cursor, -1))}
          disabled={!cursor}
        >
          Previous color
        </Button>
        <Button
          variant="outline"
          onClick={() => seek(colorBoundary(decoded, cursor, 1))}
          disabled={cursor >= total}
        >
          Next color
        </Button>
        <label className="text-sm">
          Speed{" "}
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
            className="border rounded p-2 bg-white dark:bg-gray-800"
          >
            <option value={100}>Slow</option>
            <option value={500}>Normal</option>
            <option value={2000}>Fast</option>
          </select>
        </label>
      </div>
      <p className="text-sm">
        Thread {currentColor + 1} of {stats.colors}:{" "}
        {thread?.description || thread?.hex || "Unknown"} · {event}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {stats.needlePoints.toLocaleString()} needle points · {stats.jumps}{" "}
        jumps · {stats.cuts} cuts. Includes machine lock stitches. Playback does
        not predict fabric movement.
      </p>
    </section>
  );
}
