import { formatPatternDimensions } from "./patternDimensions";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePatternStore } from "../stores/usePatternStore";
import { useMachineStore } from "../stores/useMachineStore";
import { FileUpload } from "../components/FileUpload";
import { PatternCanvas } from "../components/PatternCanvas";
import { preparePattern } from "./preparePattern";
import { playbackStats } from "./playback";
import { DensityInspector } from "./DensityInspector";
import { StitchPlayback } from "./StitchPlayback";
import { Button } from "../components/ui/button";
import { usePatternValidation } from "../hooks/domain/usePatternValidation";

export function PrepareScreen({
  onContinue,
  onCreate,
}: {
  onContinue: () => void;
  onCreate: () => void;
}) {
  const {
    pesData,
    uploadedPesData,
    patternOffset,
    uploadedPatternOffset,
    patternRotation,
  } = usePatternStore(
    useShallow((s) => ({
      pesData: s.pesData,
      uploadedPesData: s.uploadedPesData,
      patternOffset: s.patternOffset,
      uploadedPatternOffset: s.uploadedPatternOffset,
      patternRotation: s.patternRotation,
    })),
  );
  const fileName = usePatternStore((s) => s.currentFileName);
  const machineInfo = useMachineStore((s) => s.machineInfo);
  const [view, setView] = useState<"placement" | "playback" | "density">(
    "placement",
  );
  const prepared = useMemo(
    () =>
      uploadedPesData
        ? { data: uploadedPesData, offset: uploadedPatternOffset }
        : pesData
          ? preparePattern(pesData, patternOffset, patternRotation)
          : null,
    [
      pesData,
      uploadedPesData,
      patternOffset,
      uploadedPatternOffset,
      patternRotation,
    ],
  );
  const validation = usePatternValidation({
    pesData: uploadedPesData || pesData,
    machineInfo: machineInfo || { maxWidth: 1000, maxHeight: 1000 },
    patternOffset: uploadedPesData ? uploadedPatternOffset : patternOffset,
    patternRotation: uploadedPesData ? 0 : patternRotation,
  });
  const stats = prepared ? playbackStats(prepared.data.penStitches) : null;
  return (
    <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[360px_1fr] gap-4 items-start">
        <div className="space-y-4">
          <section className="bg-white dark:bg-gray-800 rounded-xl border p-4 space-y-3">
            <h1 className="text-xl font-bold">Prepare to stitch</h1>
            {prepared && (
              <p className="font-medium break-words">
                {fileName}
                <br />
                <span className="text-sm font-normal">
                  Final machine area: {formatPatternDimensions(prepared.data)}
                </span>
              </p>
            )}
            <p className="text-sm">
              Place your design in the hoop, then play its stitches. Nothing is
              sent to the machine here.
            </p>
            {uploadedPesData && (
              <p className="text-sm">
                Showing the uploaded job. Delete it on Stitch before preparing a
                replacement.
              </p>
            )}
            {stats && (
              <p className="text-sm">
                {stats.needlePoints.toLocaleString()} needle points ·{" "}
                {stats.colors} threads · {stats.cuts} cuts
                <br />
                About {Math.max(1, Math.ceil(stats.needlePoints / 400))} min of
                sewing at 400 stitches/min, plus thread changes and stops.
              </p>
            )}
            {validation.error && (
              <p role="alert" className="text-red-700 dark:text-red-300">
                {validation.error}
              </p>
            )}
            <Button
              className="w-full"
              disabled={!prepared || !validation.fits}
              onClick={onContinue}
            >
              Continue to Stitch
            </Button>
            <Button variant="outline" className="w-full" onClick={onCreate}>
              Back to Create
            </Button>
          </section>
          <FileUpload preparationOnly />
        </div>
        <div className="min-w-0 space-y-3">
          {prepared ? (
            <>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Review design"
              >
                <Button
                  variant={view === "placement" ? "default" : "outline"}
                  onClick={() => setView("placement")}
                >
                  Placement
                </Button>
                <Button
                  variant={view === "playback" ? "default" : "outline"}
                  onClick={() => setView("playback")}
                >
                  Stitch playback
                </Button>
                <Button
                  variant={view === "density" ? "default" : "outline"}
                  onClick={() => setView("density")}
                >
                  Density inspection
                </Button>
              </div>
              {view === "placement" ? (
                <div className="h-[min(75dvh,720px)] min-h-[400px]">
                  <PatternCanvas />
                </div>
              ) : view === "density" ? (
                <DensityInspector
                  pattern={prepared.data}
                  offset={prepared.offset}
                  hoopWidth={machineInfo?.maxWidth}
                  hoopHeight={machineInfo?.maxHeight}
                />
              ) : (
                <StitchPlayback
                  pattern={prepared.data}
                  offset={prepared.offset}
                  hoopWidth={machineInfo?.maxWidth}
                  hoopHeight={machineInfo?.maxHeight}
                />
              )}
            </>
          ) : (
            <section className="border rounded-xl p-8 bg-white dark:bg-gray-800">
              <h2 className="font-bold text-lg">Choose a design to review</h2>
              <p className="mt-2">
                Prepare a design from Create, or choose a PES file. You can
                review it before connecting.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
