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
import { HoopAlignment } from "../components/HoopAlignment";
import { Switch } from "../components/ui/switch";
import { usePrepareOptions } from "./prepareOptions";
import { designName } from "./designName";
import { useHoopImageStore } from "../stores/useHoopImageStore";

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
  const fileName = usePatternStore((s) =>
    s.uploadedPesData ? s.uploadedFileName : s.currentFileName,
  );
  const machineInfo = useMachineStore((s) => s.machineInfo);
  const [view, setView] = useState<"placement" | "playback" | "density">(
    "placement",
  );
  const pauseAfterCuts = usePrepareOptions((s) => s.pauseAfterCuts);
  const setPauseAfterCuts = usePrepareOptions((s) => s.setPauseAfterCuts);
  const prepared = useMemo(
    () =>
      uploadedPesData
        ? { data: uploadedPesData, offset: uploadedPatternOffset }
        : pesData
          ? preparePattern(
              pesData,
              patternOffset,
              patternRotation,
              pauseAfterCuts,
            )
          : null,
    [
      pesData,
      uploadedPesData,
      patternOffset,
      uploadedPatternOffset,
      patternRotation,
      pauseAfterCuts,
    ],
  );
  const validation = usePatternValidation({
    pesData: uploadedPesData || pesData,
    machineInfo: machineInfo || { maxWidth: 1000, maxHeight: 1000 },
    patternOffset: uploadedPesData ? uploadedPatternOffset : patternOffset,
    patternRotation: uploadedPesData ? 0 : patternRotation,
  });
  const stats = prepared ? playbackStats(prepared.data.penStitches) : null;
  // A hoop photo is a placement aid: once it is lined up, show the view it appears in.
  const hoopPhoto = useHoopImageStore((s) => s.status);
  const [seenHoopPhoto, setSeenHoopPhoto] = useState(hoopPhoto);
  if (hoopPhoto !== seenHoopPhoto) {
    setSeenHoopPhoto(hoopPhoto);
    if (hoopPhoto === "aligned") setView("placement");
  }
  return (
    <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[360px_1fr] gap-4 items-start">
        <div className="space-y-4">
          <section className="bg-white dark:bg-gray-800 rounded-xl border p-4 space-y-3">
            <h1 className="text-xl font-bold">Prepare to stitch</h1>
            {prepared && (
              <p className="font-medium break-words">
                {designName(fileName)}
                <br />
                <span className="text-sm font-normal">
                  Size when stitched: {formatPatternDimensions(prepared.data)}
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
                {stats.needlePoints.toLocaleString()} stitches, {stats.colors}{" "}
                {stats.colors === 1 ? "thread" : "threads"}, {stats.cuts}{" "}
                {stats.cuts === 1 ? "thread cut" : "thread cuts"}
                {stats.pauses > 0 &&
                  `, ${stats.pauses} ${stats.pauses === 1 ? "pause" : "pauses"} after cuts`}
                .
                <br />
                About {Math.max(1, Math.ceil(stats.needlePoints / 400))}{" "}
                {Math.ceil(stats.needlePoints / 400) > 1 ? "minutes" : "minute"}{" "}
                of sewing, plus time to change threads.
              </p>
            )}
            {/* From Jibbe23/respira (2f17126, 6f44986): each cut also stops the machine. */}
            {prepared && !uploadedPesData && (
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="pause-after-cuts"
                    className="text-sm font-medium"
                  >
                    Pause after each thread cut
                  </label>
                  <Switch
                    id="pause-after-cuts"
                    checked={pauseAfterCuts}
                    onCheckedChange={setPauseAfterCuts}
                  />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  The machine stops after it cuts the thread, so you can hold
                  the loose end while it starts again, then press Start/Stop.
                  Turn this on if the thread pulls out of the needle after cuts.
                </p>
              </div>
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
          {/* Photo of the hooped fabric under the design, from Dunar Dolorgiet's hoop-photo alignment
              (jhbruhn/respira#95). Placement happens on this screen, so the card lives here. */}
          {prepared && !uploadedPesData && <HoopAlignment />}
          {/* Tucked away: most designs come from Create, and this card repeats the summary above */}
          <details className="rounded-xl border bg-white dark:bg-gray-800">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold min-h-11">
              Use an embroidery file instead (.pes)
            </summary>
            <div className="p-2 pt-0">
              <FileUpload preparationOnly />
            </div>
          </details>
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
                  Place in the hoop
                </Button>
                <Button
                  variant={view === "playback" ? "default" : "outline"}
                  onClick={() => setView("playback")}
                >
                  Watch it stitch
                </Button>
                <Button
                  variant={view === "density" ? "default" : "outline"}
                  onClick={() => setView("density")}
                >
                  Stitch density (advanced)
                </Button>
              </div>
              {view === "placement" ? (
                <div className="h-[min(84dvh,820px)] min-h-[460px]">
                  <PatternCanvas showThreads />
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
              <h2 className="font-bold text-lg">Nothing to place yet</h2>
              <p className="mt-2">
                Make a design on Create and tap Prepare to stitch, or open an
                embroidery file (.pes). The machine does not need to be
                connected for this.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
