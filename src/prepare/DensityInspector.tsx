import { useEffect, useMemo, useRef, useState } from "react";
import type { PesPatternData } from "../formats/import/pesImporter";
import { decodePenData } from "../formats/pen/decoder";
import { analyzeDensity, densityColor } from "./density";
interface Props {
  pattern: PesPatternData;
  offset: { x: number; y: number };
  hoopWidth?: number;
  hoopHeight?: number;
}
export function DensityInspector({
  pattern,
  offset,
  hoopWidth = 1000,
  hoopHeight = 1000,
}: Props) {
  const decoded = useMemo(
    () => decodePenData(pattern.penData),
    [pattern.penData],
  );
  const [cellMm, setCellMm] = useState(2),
    [block, setBlock] = useState(-1),
    [cutoff, setCutoff] = useState(10),
    [selection, setSelection] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const shiftX =
    (offset.x - (pattern.bounds.minX + pattern.bounds.maxX) / 2) / 10;
  const shiftY =
    (offset.y - (pattern.bounds.minY + pattern.bounds.maxY) / 2) / 10;
  const selectedBlock = block < decoded.colorBlocks.length ? block : -1;
  const analysis = useMemo(
    () =>
      analyzeDensity(decoded, { cellMm, block: selectedBlock, shiftX, shiftY }),
    [decoded, cellMm, selectedBlock, shiftX, shiftY],
  );
  const extent = useMemo(
    () =>
      analysis.cells.reduce(
        (m, c) =>
          Math.max(
            m,
            Math.abs(c.x),
            Math.abs(c.x + cellMm),
            Math.abs(c.y),
            Math.abs(c.y + cellMm),
          ),
        Math.max(hoopWidth, hoopHeight) / 20,
      ),
    [analysis, cellMm, hoopWidth, hoopHeight],
  );
  const scale = 728 / (2 * extent || 100),
    selected = analysis.cells.find((c) => c.key === selection);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 800, 800);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, 800, 800);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let mm = -Math.ceil(extent / 10) * 10; mm <= extent; mm += 10) {
      const p = 400 + mm * scale;
      ctx.beginPath();
      ctx.moveTo(p, 36);
      ctx.lineTo(p, 764);
      ctx.moveTo(36, p);
      ctx.lineTo(764, p);
      ctx.stroke();
    }
    for (const c of analysis.cells) {
      ctx.fillStyle = densityColor(c.density, cutoff);
      ctx.globalAlpha = 0.75;
      ctx.fillRect(
        400 + c.x * scale,
        400 + c.y * scale,
        cellMm * scale,
        cellMm * scale,
      );
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      400 - (hoopWidth / 20) * scale,
      400 - (hoopHeight / 20) * scale,
      (hoopWidth / 10) * scale,
      (hoopHeight / 10) * scale,
    );
    ctx.fillStyle = "#334155";
    ctx.font = "16px sans-serif";
    ctx.fillText("Hoop center (0, 0)", 410, 390);
    ctx.beginPath();
    ctx.moveTo(392, 400);
    ctx.lineTo(408, 400);
    ctx.moveTo(400, 392);
    ctx.lineTo(400, 408);
    ctx.stroke();
    if (selected) {
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 3;
      ctx.strokeRect(
        400 + selected.x * scale,
        400 + selected.y * scale,
        cellMm * scale,
        cellMm * scale,
      );
    }
  }, [
    analysis,
    cellMm,
    cutoff,
    selected,
    scale,
    extent,
    hoopWidth,
    hoopHeight,
  ]);
  const highlighted = analysis.cells.filter((c) => c.density >= cutoff).length;
  return (
    <section
      aria-label="Density inspection"
      className="border rounded-xl bg-white dark:bg-gray-800 p-4 space-y-4"
    >
      <div>
        <h2 className="text-lg font-bold">Density inspection</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Needle penetrations per mm², from final machine stitches. Includes
          underlay and lock stitches; ignores jumps, cuts and color stops.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <label>
          Grid cell{" "}
          <select
            aria-label="Density grid cell"
            className="block border rounded p-2 bg-white dark:bg-gray-800 text-base"
            value={cellMm}
            onChange={(e) => setCellMm(+e.target.value)}
          >
            <option value={1}>1 × 1 mm</option>
            <option value={2}>2 × 2 mm</option>
            <option value={5}>5 × 5 mm</option>
          </select>
        </label>
        <label>
          Thread blocks{" "}
          <select
            aria-label="Density thread blocks"
            className="block border rounded p-2 bg-white dark:bg-gray-800 text-base max-w-full"
            value={selectedBlock}
            onChange={(e) => setBlock(+e.target.value)}
          >
            <option value={-1}>All thread blocks</option>
            {decoded.colorBlocks.map((b) => (
              <option key={b.colorIndex} value={b.colorIndex}>
                {b.colorIndex + 1}:{" "}
                {pattern.threads[b.colorIndex]?.description || "Thread"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Highlight at (points/mm²)
          <select
            aria-label="Density highlight cutoff"
            className="block border rounded p-2 bg-white dark:bg-gray-800 text-base"
            value={cutoff}
            onChange={(e) => setCutoff(+e.target.value)}
          >
            {[2, 5, 10, 20, 50, 100].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mx-auto" style={{ width: "min(100%, 52dvh)" }}>
        <canvas
          ref={canvas}
          width={800}
          height={800}
          role="img"
          aria-label="Needle density map; tap a colored cell or use the cell list below"
          className="w-full aspect-square rounded-lg touch-manipulation"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = (((e.clientX - r.left) / r.width) * 800 - 400) / scale,
              y = (((e.clientY - r.top) / r.height) * 800 - 400) / scale;
            setSelection(`${Math.floor(x / cellMm)},${Math.floor(y / cellMm)}`);
          }}
        />
      </div>
      <div
        className="flex flex-wrap gap-3 text-sm"
        aria-label="Density color legend"
      >
        {[
          [`Below ${cutoff / 4}`, "#3b82f6"],
          [`${cutoff / 4}–${cutoff / 2}`, "#22c55e"],
          [`${cutoff / 2}–${cutoff}`, "#f59e0b"],
          [`${cutoff} and above`, "#dc2626"],
        ].map(([label, color]) => (
          <span key={color} className="inline-flex gap-1 items-center">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ background: color }}
            />
            {label}
          </span>
        ))}
      </div>
      <p className="text-sm" role="status">
        {analysis.total.toLocaleString()} needle points · peak{" "}
        {analysis.peak.toFixed(2)} points/mm² · {highlighted} cells at or above
        the cutoff.
      </p>
      <p className="text-sm">
        {analysis.shortSegments.toLocaleString()} short sewn segments (&lt;0.3
        mm), including {analysis.repeatedPoints.toLocaleString()} at the same
        point. Lock stitches can intentionally create clusters.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        The cutoff is a visual guide, not a fabric safety limit. Grid size and
        alignment affect the map. Use all thread blocks to see accumulated
        passes, then compare individual blocks. Test-stitch on your fabric and
        stabilizer.
      </p>
      <p className="text-sm">
        {selected
          ? `Selected cell: ${selected.count} points, ${selected.density.toFixed(2)} points/mm²; thread blocks ${selected.blocks.map((b) => b + 1).join(", ")}.`
          : "Tap a colored cell, or choose a high-density cell below."}
      </p>
      <details>
        <summary className="cursor-pointer font-semibold">
          Highest-density cells
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th className="p-2">Cell center (mm from hoop center)</th>
                <th>Points</th>
                <th>Points/mm²</th>
              </tr>
            </thead>
            <tbody>
              {analysis.cells.slice(0, 10).map((c) => (
                <tr key={c.key}>
                  <td className="p-2">
                    <button
                      className="underline min-h-10"
                      onClick={() => setSelection(c.key)}
                    >
                      X {(c.x + cellMm / 2).toFixed(1)}, Y{" "}
                      {(c.y + cellMm / 2).toFixed(1)}
                    </button>
                  </td>
                  <td>{c.count}</td>
                  <td>{c.density.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
