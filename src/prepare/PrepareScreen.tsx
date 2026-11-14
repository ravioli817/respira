import { formatPatternDimensions } from "./patternDimensions";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePatternStore } from "../stores/usePatternStore";
import { useMachineStore } from "../stores/useMachineStore";
import { FileUpload } from "../components/FileUpload";
import { PatternCanvas } from "../components/PatternCanvas";
import { ThreadLegend } from "../components/PatternCanvas/ThreadLegend";
import { preparePattern } from "./preparePattern";
import { playbackStats } from "./playback";
import { DensityInspector } from "./DensityInspector";
import { StitchPlayback } from "./StitchPlayback";
import { usePatternValidation } from "../hooks/domain/usePatternValidation";
import { HoopAlignment } from "../components/HoopAlignment";
import { Switch } from "../components/ui/switch";
import { usePrepareOptions } from "./prepareOptions";
import { displayName } from "../projects/projectUi";
import { useHoopImageStore } from "../stores/useHoopImageStore";
import { cn } from "@/lib/utils";

/** Quiet full-width rows in the side panel. */
const ROW =
  "flex items-center gap-3 w-full min-h-[52px] px-3.5 py-2 rounded-xl border border-line-strong bg-paper text-left cursor-pointer hover:bg-accent";
const SUMMARY = cn(ROW, "list-none [&::-webkit-details-marker]:hidden");

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 ml-auto flex-shrink-0 transition-transform group-open:rotate-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

/**
 * Place: the second step. The design sits in the hoop on the mat, to be dragged and turned to where
 * it should stitch. The panel beside it says what it will take (size, time, threads) and leads on to
 * Stitch. Nothing is sent to the machine from here.
 */
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
  // Without a design there is nothing to play back.
  const shown = prepared ? view : "placement";
  const name = displayName(fileName);
  const minutes = stats ? Math.max(1, Math.ceil(stats.needlePoints / 400)) : 0;
  const onMachine = !!uploadedPesData;

  return (
    <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,372px)_minmax(0,1fr)] content-start lg:content-normal overflow-y-auto lg:overflow-hidden">
      {/* Beside the hoop the panel scrolls within its column; stacked above it, it takes its own height. */}
      <div className="bg-paper text-ink lg:border-r border-line flex flex-col lg:min-h-0">
        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight text-balance">
              {!prepared
                ? "Nothing to place yet"
                : onMachine
                  ? "This design is on the machine"
                  : "Put it where you want it"}
            </h1>
            <p className="text-ink-soft">
              {!prepared ? (
                <>
                  Draw something on Create, then tap Place. The machine does not
                  need to be connected for this.
                </>
              ) : onMachine ? (
                <>
                  It can't be moved now. To place a different design, delete
                  this one on Stitch first.
                </>
              ) : (
                <>
                  Drag {name ? `“${name}”` : "your design"} inside the hoop.
                  Nothing goes to the machine yet.
                </>
              )}
            </p>
          </div>

          {prepared && stats && (
            <div className="flex flex-col gap-1">
              <p>
                <strong>{formatPatternDimensions(prepared.data)}</strong> when
                stitched
              </p>
              <p>
                <strong>
                  About {minutes} {minutes === 1 ? "minute" : "minutes"}
                </strong>{" "}
                of sewing, {stats.needlePoints.toLocaleString()} stitches
                {stats.colors > 1 && ", plus time to change threads"}
              </p>
            </div>
          )}

          {validation.error && (
            <p
              role="alert"
              className="rounded-xl border-l-8 border-pin bg-danger-50 dark:bg-danger-950 px-4 py-3"
            >
              {validation.error}
            </p>
          )}

          {prepared && (
            <div className="flex flex-col gap-2.5">
              <h2 className="text-xl font-bold">Threads you will need</h2>
              <ThreadLegend colors={prepared.data.threads} />
            </div>
          )}

          {prepared && (
            <div className="flex flex-col gap-2.5">
              {/* Photo of the hooped fabric under the design, from Dunar Dolorgiet's hoop-photo
                  alignment (jhbruhn/respira#95). Placement happens on this screen, so it lives here. */}
              {!onMachine && (
                <details className="group">
                  <summary className={SUMMARY}>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="size-6 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                    See your fabric: add a photo of the hoop
                    <Chevron />
                  </summary>
                  <div className="mt-2.5">
                    <HoopAlignment />
                  </div>
                </details>
              )}
              <button
                type="button"
                className={ROW}
                aria-pressed={shown === "playback"}
                onClick={() =>
                  setView(shown === "playback" ? "placement" : "playback")
                }
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-6 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
                {shown === "playback"
                  ? "Back to placing it"
                  : "Watch how it will stitch"}
              </button>
              <button
                type="button"
                className={ROW}
                aria-pressed={shown === "density"}
                onClick={() =>
                  setView(shown === "density" ? "placement" : "density")
                }
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-6 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
                </svg>
                {shown === "density"
                  ? "Back to placing it"
                  : "Check how dense the stitches are"}
              </button>
            </div>
          )}

          {/* From Jibbe23/respira (2f17126, 6f44986): each cut also stops the machine. */}
          {prepared && !onMachine && (
            <div className="rounded-xl border border-line-strong p-3.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="pause-after-cuts" className="font-bold">
                  Pause after each thread cut
                </label>
                <Switch
                  id="pause-after-cuts"
                  checked={pauseAfterCuts}
                  onCheckedChange={setPauseAfterCuts}
                />
              </div>
              <p className="text-sm text-ink-soft">
                Turn this on if the thread pulls out of the needle after a cut:
                the machine waits so you can hold the loose end, then press
                Start/Stop.
                {stats &&
                  ` This design has ${stats.cuts} ${stats.cuts === 1 ? "cut" : "cuts"}${
                    stats.pauses > 0
                      ? `, so ${stats.pauses} ${stats.pauses === 1 ? "pause" : "pauses"}`
                      : ""
                  }.`}
              </p>
            </div>
          )}

          {/* Most designs come from Create. Opening a file is in plain view, but folded: its
              card is tall. With nothing placed yet it is the one thing to do here, so it is open. */}
          <details className="group" open={!prepared}>
            <summary className={SUMMARY}>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-6 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 3h8l4 4v14H6zM14 3v4h4" />
              </svg>
              {prepared
                ? "Use an embroidery file instead (.pes)"
                : "Open an embroidery file (.pes)"}
              <Chevron />
            </summary>
            <div className="mt-2.5 rounded-xl border border-line p-1.5">
              <FileUpload preparationOnly />
            </div>
          </details>
        </div>

        <div className="flex-shrink-0 p-5 sm:p-6 pt-3 sm:pt-3 border-t border-line lg:border-t-0">
          {prepared ? (
            <button
              type="button"
              className="w-full min-h-[60px] px-4 rounded-[14px] bg-action text-white text-xl font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!validation.fits}
              onClick={onContinue}
            >
              {onMachine ? "Go to Stitch" : "Next: send it and stitch"}
            </button>
          ) : (
            <button
              type="button"
              className="w-full min-h-[60px] px-4 rounded-[14px] bg-action text-white text-xl font-bold cursor-pointer"
              onClick={onCreate}
            >
              Go to Create
            </button>
          )}
        </div>
      </div>

      <div className="min-w-0 min-h-[min(36rem,115vw)] lg:min-h-0 flex flex-col">
        {shown === "placement" || !prepared ? (
          <PatternCanvas />
        ) : (
          <div className="mat-surface flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
            <div className="max-w-3xl mx-auto text-ink">
              {shown === "density" ? (
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
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
