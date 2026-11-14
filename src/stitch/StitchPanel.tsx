import { MachineStatus } from "../types/machine";
import { useEffect, useMemo, useRef, useState } from "react";
import { useJobState, watchJob } from "./jobState";
import { useShallow } from "zustand/react/shallow";
import {
  selectPatternUploaded,
  useMachineStore,
} from "../stores/useMachineStore";
import { usePatternStore } from "../stores/usePatternStore";
import { useMachineUploadStore } from "../stores/useMachineUploadStore";
import { NextStepCard } from "../guide/NextStepCard";
import {
  stepLook,
  threadLabel,
  threadParts,
  type StepLook,
} from "../guide/nextStep";
import { useNextStep } from "../guide/useNextStep";
import {
  chime,
  primeAudio,
  setSoundEnabled,
  useSound,
} from "../guide/attention";
import { displayName } from "../projects/projectUi";
import { StitchSeam } from "./StitchSeam";
import { cn } from "@/lib/utils";
import {
  stitchAction,
  threadFocus,
  type WorkflowState,
  type StitchCommand,
} from "./workflow";
import { preparePattern } from "../prepare/preparePattern";
import { usePrepareOptions } from "../prepare/prepareOptions";
import { usePatternRotationUpload } from "../hooks/domain/usePatternRotationUpload";
import { usePatternValidation } from "../hooks/domain/usePatternValidation";
import {
  calculateColorBlocks,
  classifyMachineStop,
} from "../utils/colorBlockHelpers";
import {
  canChooseStartBlock,
  canDeletePattern,
  canShowStepControl,
  canStartMaskTrace,
} from "../utils/machineStateHelpers";
import { Switch } from "../components/ui/switch";
import { isBluetoothSupported } from "../utils/bluetoothSupport";
import { calculatePatternTime } from "../utils/timeCalculation";
import { ProgressStats } from "../components/ProgressMonitor/ProgressStats";
import { PatternInfo } from "../components/PatternInfo";
import { StitchStepControl } from "../components/ProgressMonitor/StitchStepControl";
import { Progress } from "../components/ui/progress";

function currentWorkflow(): WorkflowState {
  const m = useMachineStore.getState(),
    p = usePatternStore.getState(),
    u = useMachineUploadStore.getState();
  return {
    connected: m.isConnected,
    status: m.machineStatus,
    error: m.machineError,
    hasPattern: !!p.pesData,
    uploaded: selectPatternUploaded(m),
    uploading: u.isUploading,
    deleting: m.isDeleting,
    current: m.adjustedStitchIndex ?? m.sewingProgress?.currentStitch ?? 0,
    total:
      p.uploadedPesData?.penStitches.stitches.length ??
      m.patternInfo?.totalStitches ??
      0,
    finished: useJobState.getState().finished,
  };
}
/** The one large button in the instruction card, coloured to stand out on each look of card. */
const ACTION_BUTTON: Record<StepLook, string> = {
  yours: "bg-[#17212b] text-white",
  fault: "bg-white text-[#17212b]",
  machine: "bg-white text-[#17212b]",
  plain: "bg-action text-white",
};
/** Where a button would be, a strip saying which button to press on the machine itself. */
const MACHINE_STRIP: Record<StepLook, string> = {
  yours: "bg-black/10",
  fault: "bg-white/15",
  machine: "bg-white/15",
  plain: "bg-secondary",
};
/** Quiet full-width buttons in the lower half of the panel. */
const ROW_BUTTON =
  "flex items-center justify-between gap-3 w-full min-h-[52px] px-4 py-2 rounded-xl border border-line-strong bg-paper text-left cursor-pointer hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed";

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 flex-shrink-0 transition-transform group-open:rotate-90"
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
export function StitchPanel({ onPrepare }: { onPrepare: () => void }) {
  const m = useMachineStore(
    useShallow((s) => ({
      connected: s.isConnected,
      status: s.machineStatus,
      error: s.machineError,
      patternInfo: s.patternInfo,
      progress: s.sewingProgress,
      deleting: s.isDeleting,
      adjusted: s.adjustedStitchIndex,
      rollback: s.lastRolledBackError,
      paused: s.pausedStitchIndex,
      message: s.error,
      machineInfo: s.machineInfo,
      loaded: selectPatternUploaded(s),
    })),
  );
  const p = usePatternStore(
    useShallow((s) => ({
      data: s.pesData,
      uploaded: s.uploadedPesData,
      offset: s.patternOffset,
      rotation: s.patternRotation,
      name: s.currentFileName,
      uploadedName: s.uploadedFileName,
      setUploaded: s.setUploadedPattern,
    })),
  );
  const u = useMachineUploadStore(
    useShallow((s) => ({
      uploading: s.isUploading,
      progress: s.uploadProgress,
      upload: s.uploadPattern,
    })),
  );
  const [pending, setPending] = useState(false),
    [localError, setLocalError] = useState("");
  // This panel stays mounted on every screen, so the job is watched for the whole session.
  useEffect(() => watchJob(), []);
  const finished = useJobState((s) => s.finished);
  const acting = useRef(false);
  const { handleUpload } = usePatternRotationUpload({
    uploadPattern: u.upload,
    setUploadedPattern: p.setUploaded,
  });
  const pauseAfterCuts = usePrepareOptions((s) => s.pauseAfterCuts);
  const prepared = useMemo(
    () =>
      p.data
        ? preparePattern(p.data, p.offset, p.rotation, pauseAfterCuts)
        : null,
    [p.data, p.offset, p.rotation, pauseAfterCuts],
  );
  // True from the machine's status alone while its pattern details are still being read back
  // after a reconnect (see selectPatternUploaded).
  const uploaded = m.loaded;
  // Never label a machine's existing job using an unrelated local draft.
  const display = uploaded ? p.uploaded : prepared?.data || null;
  const blocks = useMemo(() => calculateColorBlocks(display), [display]);
  const total =
    display?.penStitches.stitches.length ?? m.patternInfo?.totalStitches ?? 0;
  // With "Pause after each thread cut", some stops are pauses, which the machine reports as thread changes.
  const trimStops = display?.penStitches.trimStops;
  const pausedAfterCut =
    m.status === MachineStatus.COLOR_CHANGE_WAIT &&
    !!trimStops?.length &&
    classifyMachineStop(
      blocks,
      m.adjusted ?? m.progress?.currentStitch ?? 0,
      trimStops,
    ).kind === "trim";
  // The last progress reading is taken just before the end; a job the machine calls complete is complete.
  const done = finished || m.status === MachineStatus.SEWING_COMPLETE;
  const current =
    m.adjusted ?? (done ? total : (m.progress?.currentStitch ?? 0));
  const action = stitchAction({
    connected: m.connected,
    status: m.status,
    error: m.error,
    hasPattern: !!p.data,
    uploaded,
    uploading: u.uploading,
    deleting: m.deleting,
    current,
    total,
    finished,
    pausedAfterCut,
  });
  const timing = useMemo(
    () => calculatePatternTime(blocks, current),
    [blocks, current],
  );
  const focus = threadFocus(blocks, m.status, current, pausedAfterCut);
  const bounds = usePatternValidation({
    pesData: p.data,
    machineInfo: m.machineInfo,
    patternOffset: p.offset,
    patternRotation: p.rotation,
  });
  const busy = pending || u.uploading || m.deleting;

  // Opt-in: start, or start again, from a chosen thread instead of the first stitch. This is
  // torfeu's "start from a chosen color block" for Respira's progress card (jhbruhn/respira#98,
  // tested there on a PP1), fitted to this panel. Leaving the mode restores the old position.
  const canChoose =
    uploaded && blocks.length > 1 && !finished && canChooseStartBlock(m.status);
  const [choosing, setChoosing] = useState(false);
  const [couldChoose, setCouldChoose] = useState(canChoose);
  const positionBeforeChoosing = useRef<number | null>(null);
  if (canChoose !== couldChoose) {
    setCouldChoose(canChoose);
    if (!canChoose) setChoosing(false);
  }
  const isChoosing = choosing && canChoose;
  async function run(command: StitchCommand, secondary = false) {
    if (acting.current) return;
    const now = currentWorkflow();
    if (secondary) {
      if (!now.connected || now.uploading || now.deleting || !now.uploaded)
        return;
      if (command === "delete" && !canDeletePattern(now.status)) return;
      if (
        command === "trace" &&
        !canStartMaskTrace(now.status, now.current > 0)
      )
        return;
    } else if (stitchAction(now).command !== command) return;
    if (command === "upload" && !bounds.fits) return;
    acting.current = true;
    setPending(true);
    setLocalError("");
    try {
      const machine = useMachineStore.getState();
      if (command === "connect") await machine.connect();
      else if (command === "prepare") onPrepare();
      else if (command === "upload") {
        const draft = usePatternStore.getState();
        if (draft.pesData)
          await handleUpload(
            draft.pesData,
            draft.currentFileName || "design.pes",
            draft.patternOffset,
            draft.patternRotation,
          );
      } else if (command === "trace") await machine.startMaskTrace();
      else if (command === "start") await machine.startSewing();
      else if (command === "resume") await machine.resumeSewing();
      else if (command === "delete") await machine.deletePattern();
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "The action could not be completed.",
      );
      if (command === "upload" && !useMachineStore.getState().patternInfo)
        usePatternStore.getState().clearUploadedPattern();
    } finally {
      acting.current = false;
      setPending(false);
    }
  }
  async function recover(value: number, absolute = false) {
    const now = currentWorkflow();
    if (
      acting.current ||
      !now.connected ||
      !now.uploaded ||
      now.uploading ||
      now.deleting ||
      !canShowStepControl(now.status, now.current > 0)
    )
      return;
    acting.current = true;
    setPending(true);
    setLocalError("");
    try {
      const machine = useMachineStore.getState();
      if (absolute) await machine.setStitchPosition(value, now.total);
      else await machine.adjustStitchPosition(value, now.total);
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "The stitch position could not be changed.",
      );
    } finally {
      acting.current = false;
      setPending(false);
    }
  }
  async function startFrom(stitch: number) {
    const now = currentWorkflow();
    if (
      acting.current ||
      !now.connected ||
      !now.uploaded ||
      now.uploading ||
      now.deleting ||
      !canChooseStartBlock(now.status)
    )
      return;
    acting.current = true;
    setPending(true);
    setLocalError("");
    try {
      await useMachineStore.getState().setStitchPosition(stitch, now.total);
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "The starting point could not be changed.",
      );
    } finally {
      acting.current = false;
      setPending(false);
    }
  }
  function setChoosingStart(on: boolean) {
    setChoosing(on);
    if (on) {
      positionBeforeChoosing.current = current;
      return;
    }
    const previous = positionBeforeChoosing.current;
    positionBeforeChoosing.current = null;
    if (previous !== null && previous !== current) void startFrom(previous);
  }
  const supported = isBluetoothSupported();
  const step = useNextStep();
  const look = step ? stepLook(step) : "plain";
  const sound = useSound();
  // At a thread change the card itself ends with what to press, so the strip would only repeat it.
  const cardSaysIt =
    !!step?.spool && m.status === MachineStatus.COLOR_CHANGE_WAIT;
  const name = displayName(uploaded ? p.uploadedName || p.name : p.name);
  const started = uploaded && current > 0;
  const minutes = (n: number) => `${n} ${n === 1 ? "minute" : "minutes"}`;
  const small = blocks.length > 8;
  return (
    <section
      aria-label="Stitch control panel"
      className="bg-paper text-ink lg:border-r border-line lg:overflow-y-auto lg:min-h-0 flex flex-col"
    >
      <h1 className="sr-only">Stitch</h1>
      <NextStepCard>
        <div aria-label="Next action" className="flex flex-col gap-3">
          {action.kind === "app" &&
          (action.command !== "connect" || supported) ? (
            <button
              type="button"
              className={cn(
                "w-full min-h-16 px-4 py-2 rounded-[14px] text-[22px] leading-tight font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                ACTION_BUTTON[look],
              )}
              disabled={busy || (action.command === "upload" && !bounds.fits)}
              onClick={() => void run(action.command!)}
            >
              {pending ? "Working…" : action.label}
            </button>
          ) : (
            !cardSaysIt && (
              <p
                className={cn(
                  "rounded-xl px-4 py-3 font-bold",
                  MACHINE_STRIP[look],
                )}
              >
                {action.command === "connect"
                  ? "This browser cannot connect with Bluetooth."
                  : action.label}
              </p>
            )
          )}
          {action.command === "connect" && !supported && (
            <a
              className="underline"
              href="https://apps.apple.com/app/id1492822055"
              target="_blank"
              rel="noreferrer"
            >
              Open the app in Bluefy on iPad
            </a>
          )}
          {action.command === "upload" && bounds.error && (
            <p
              role="alert"
              className="rounded-xl border-l-8 border-pin bg-white text-[#17212b] px-4 py-3"
            >
              {bounds.error}
            </p>
          )}
          {(localError || m.message) && (
            <p
              role="alert"
              className="rounded-xl border-l-8 border-pin bg-white text-[#17212b] px-4 py-3"
            >
              {localError || m.message}
            </p>
          )}
          {u.uploading && (
            <div>
              <Progress value={u.progress} aria-label="Sending progress" />
              <p className="mt-1">{u.progress.toFixed(0)}% sent</p>
            </div>
          )}
        </div>
      </NextStepCard>

      <div className="flex-1 flex flex-col gap-5 px-5 sm:px-7 py-5">
        <p className="text-ink-soft truncate">
          {uploaded
            ? "On the machine"
            : p.data
              ? "Ready to send"
              : "Nothing placed yet"}
          {display && name ? `: ${name}` : ""}
        </p>
        {uploaded && !display && (
          <p>
            The machine holds a design this device has no copy of, so its thread
            colors cannot be shown here.
          </p>
        )}
        {uploaded && total === 0 && (
          <p role="status">Reading the job back from the machine…</p>
        )}

        {uploaded && total > 0 && (
          <div className="flex flex-col gap-2">
            <StitchSeam blocks={blocks} current={current} total={total} />
            <p className="flex flex-wrap justify-between gap-x-4">
              <span>
                {current.toLocaleString()} of {total.toLocaleString()} stitches
              </span>
              {blocks.length > 0 && (
                <span>
                  {done
                    ? "All stitched"
                    : started
                      ? `about ${minutes(Math.max(1, timing.remainingMinutes))} of sewing left`
                      : `about ${minutes(Math.max(1, timing.totalMinutes))} of sewing`}
                </span>
              )}
            </p>
          </div>
        )}

        {blocks.length > 0 && (
          <div className="flex flex-col gap-2">
            {canChoose && (
              <div className="flex items-center justify-between gap-3 min-h-11">
                <label htmlFor="choose-start-thread">
                  Start from a chosen thread
                </label>
                <Switch
                  id="choose-start-thread"
                  checked={isChoosing}
                  disabled={busy}
                  onCheckedChange={setChoosingStart}
                />
              </div>
            )}
            {isChoosing && (
              <p className="text-ink-soft">
                Tap the thread to start from. Everything before it is skipped.
                Switch this off to go back to where it was.
              </p>
            )}
            <ol
              aria-label="Threads, in sewing order"
              className={cn(
                "grid gap-x-2 gap-y-3",
                small
                  ? "grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))]"
                  : "grid-cols-4",
              )}
            >
              {blocks.map((block, i) => {
                const stitched = done || (started && i < focus.index);
                const now = !done && i === focus.index;
                const thread = threadParts(block).name || `Thread ${i + 1}`;
                const swatch = (
                  <span
                    className={cn(
                      "flex items-center justify-center rounded-full border-2 border-ink",
                      small ? "size-11" : "size-14",
                      now &&
                        "ring-[3px] ring-ink ring-offset-[3px] ring-offset-paper",
                    )}
                    style={{ background: block.threadHex }}
                  >
                    {stitched && (
                      <svg
                        role="img"
                        aria-label="Stitched"
                        viewBox="0 0 24 24"
                        className="size-6 rounded-full bg-white/85 p-0.5"
                        fill="none"
                        stroke="#17212b"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </span>
                );
                const label = now ? (
                  <strong>
                    {thread},{" "}
                    {isChoosing ? "starts here" : started ? "now" : "first"}
                  </strong>
                ) : (
                  <span>{thread}</span>
                );
                return (
                  <li
                    key={i}
                    aria-current={now ? "step" : undefined}
                    title={`Thread ${i + 1} of ${blocks.length}: ${threadLabel(block)}`}
                    className="min-w-0"
                  >
                    {isChoosing ? (
                      <button
                        type="button"
                        aria-label={`${i + 1}. ${threadLabel(block)}${now ? ", starts here" : ""}`}
                        className="flex flex-col items-center gap-1.5 w-full pt-1.5 text-center leading-tight rounded-xl cursor-pointer hover:bg-accent disabled:opacity-60"
                        disabled={busy}
                        onClick={() => void startFrom(block.startStitch)}
                      >
                        {swatch}
                        {label}
                      </button>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 pt-1.5 text-center leading-tight">
                        {swatch}
                        {label}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {uploaded && canShowStepControl(m.status, current > 0) && (
          <fieldset disabled={busy}>
            <legend className="font-bold mb-2">
              Go back or forward a few stitches
            </legend>
            <StitchStepControl
              currentStitch={current}
              adjustedStitchIndex={m.adjusted}
              pausedStitchIndex={m.paused}
              totalStitches={total}
              lastRolledBackError={m.rollback}
              colorBlocks={blocks}
              onAdjustPosition={(delta) => void recover(delta)}
              onSetPosition={(index) => void recover(index, true)}
            />
          </fieldset>
        )}

        {/* What else can be done right now, in plain view rather than behind a menu. */}
        {uploaded &&
          ((canStartMaskTrace(m.status, current > 0) &&
            action.command !== "trace") ||
            (canDeletePattern(m.status) && action.command !== "delete")) && (
            <div className="flex flex-wrap gap-2.5">
              {canStartMaskTrace(m.status, current > 0) &&
                action.command !== "trace" && (
                  <button
                    type="button"
                    className={cn(ROW_BUTTON, "flex-1 basis-48 w-auto")}
                    disabled={busy}
                    onClick={() => void run("trace", true)}
                  >
                    Trace outline again
                  </button>
                )}
              {canDeletePattern(m.status) && action.command !== "delete" && (
                <button
                  type="button"
                  className={cn(ROW_BUTTON, "flex-1 basis-48 w-auto")}
                  disabled={busy}
                  onClick={() => void run("delete", true)}
                >
                  Delete it from the machine
                </button>
              )}
            </div>
          )}

        <div className="mt-auto flex flex-wrap items-start gap-3">
          <details className="group flex-1 basis-56 min-w-0">
            <summary
              className={cn(
                ROW_BUTTON,
                "list-none [&::-webkit-details-marker]:hidden",
              )}
            >
              Design details
              <Chevron />
            </summary>
            <div className="mt-3 space-y-3">
              {!display && (
                <p className="text-ink-soft">
                  Size, stitch count and speed show here once a design is
                  placed.
                </p>
              )}
              {display && <PatternInfo pesData={display} showThreadBlocks />}
              {display && m.patternInfo && (
                <ProgressStats
                  currentStitch={current}
                  totalStitches={total}
                  elapsedMinutes={timing.elapsedMinutes}
                  totalMinutes={timing.totalMinutes}
                  speed={m.patternInfo.speed}
                />
              )}
            </div>
          </details>
          <button
            type="button"
            aria-pressed={sound}
            className={cn(ROW_BUTTON, "w-auto flex-shrink-0")}
            onClick={() => {
              setSoundEnabled(!sound);
              if (!sound) {
                primeAudio();
                chime("action");
              }
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-[22px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 10v4h4l5 4V6l-5 4z" />
              {sound ? (
                <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
              ) : (
                <path d="M17 9.5l5 5M22 9.5l-5 5" />
              )}
            </svg>
            {sound ? "Chime on" : "Chime off"}
          </button>
        </div>
      </div>
    </section>
  );
}
