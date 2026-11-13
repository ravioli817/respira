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
import { threadLabel } from "../guide/nextStep";
import {
  stitchAction,
  threadFocus,
  type WorkflowState,
  type StitchCommand,
} from "./workflow";
import { preparePattern } from "../prepare/preparePattern";
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
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import type { ColorBlock } from "../components/ProgressMonitor/types";

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
function ThreadCard({
  title,
  block,
  empty,
}: {
  title: string;
  block: ColorBlock | null;
  empty: string;
}) {
  return (
    <div className="rounded-lg border bg-white dark:bg-gray-800 p-3 min-w-0">
      <p className="text-xs uppercase font-semibold text-gray-600 dark:text-gray-300">
        {title}
      </p>
      {block ? (
        <div className="flex gap-2 mt-2 items-start">
          <span
            aria-hidden="true"
            className="w-7 h-7 shrink-0 rounded border"
            style={{ background: block.threadHex }}
          />
          <div>
            <p className="font-semibold text-sm break-words">
              {threadLabel(block)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Thread block {block.colorIndex + 1}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm">{empty}</p>
      )}
    </div>
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
  const prepared = useMemo(
    () => (p.data ? preparePattern(p.data, p.offset, p.rotation) : null),
    [p.data, p.offset, p.rotation],
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
  const percent = total
    ? Math.min(100, Math.max(0, (current / total) * 100))
    : 0;
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
  return (
    <section
      aria-label="Stitch control panel"
      className="bg-white dark:bg-gray-800 border rounded-xl shadow-sm lg:overflow-y-auto min-h-0"
    >
      <div className="border-b px-4 py-3">
        <h1 className="font-bold text-lg">Stitch</h1>
        <p className="text-sm truncate text-gray-600 dark:text-gray-300">
          {uploaded
            ? "Machine job"
            : p.data
              ? "Prepared design"
              : "No design prepared"}
          {display ? `: ${p.name}` : ""}
        </p>
      </div>
      <NextStepCard embedded>
        <div className="mt-3" aria-label="Next action">
          {action.kind === "app" &&
          (action.command !== "connect" || supported) ? (
            <Button
              className="w-full min-h-11 whitespace-normal"
              disabled={busy || (action.command === "upload" && !bounds.fits)}
              onClick={() => void run(action.command!)}
            >
              {pending ? "Working…" : action.label}
            </Button>
          ) : (
            <p className="rounded-lg p-3 bg-gray-100 dark:bg-gray-700 font-semibold text-sm">
              {action.command === "connect"
                ? "This browser cannot connect with Bluetooth."
                : action.label}
            </p>
          )}
          {action.command === "connect" && !supported && (
            <a
              className="text-sm underline"
              href="https://apps.apple.com/app/id1492822055"
              target="_blank"
              rel="noreferrer"
            >
              Open the app in Bluefy on iPad
            </a>
          )}
          {action.command === "resume" && (
            <p className="text-sm mt-2">
              Fix the thread or fabric issue above before resuming.
            </p>
          )}
          {action.command === "upload" && bounds.error && (
            <p
              role="alert"
              className="text-sm text-red-700 dark:text-red-300 mt-2"
            >
              {bounds.error}
            </p>
          )}
          {(localError || m.message) && (
            <p
              role="alert"
              className="text-sm text-red-700 dark:text-red-300 mt-2"
            >
              {localError || m.message}
            </p>
          )}
          {u.uploading && (
            <div className="mt-3">
              <Progress value={u.progress} aria-label="Upload progress" />
              <p className="text-sm mt-1">{u.progress.toFixed(0)}% uploaded</p>
            </div>
          )}
        </div>
      </NextStepCard>
      <div className="p-4 pt-0 space-y-4">
        {display && (
          <div className="grid grid-cols-2 gap-2">
            <ThreadCard
              title={focus.label}
              block={focus.current}
              empty="No thread data"
            />
            <ThreadCard
              title={
                m.status === MachineStatus.COLOR_CHANGE_WAIT
                  ? "After that"
                  : "Next thread"
              }
              block={focus.next}
              empty="No further thread changes"
            />
          </div>
        )}
        {uploaded && !display && (
          <p className="text-sm">
            Thread details are unavailable for the machine’s loaded job. The
            local draft is not used to guess its thread colors.
          </p>
        )}
        {uploaded && total === 0 && (
          <p className="text-sm" role="status">
            Reading the job back from the machine…
          </p>
        )}
        {uploaded && total > 0 && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>
                {current.toLocaleString()} / {total.toLocaleString()} stitch
                positions
              </span>
              <span>{percent.toFixed(1)}%</span>
            </div>
            <Progress value={percent} aria-label="Sewing progress" />
          </div>
        )}
        {uploaded && canShowStepControl(m.status, current > 0) && (
          <fieldset disabled={busy}>
            <legend className="font-semibold text-sm mb-2">
              Recovery — adjust the stitch position
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
        {blocks.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              All thread blocks ({blocks.length})
            </summary>
            {canChoose && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <label htmlFor="choose-start-thread" className="text-sm">
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
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Tap the thread to start from. Everything before it is skipped.
                Switch this off to go back to where it was.
              </p>
            )}
            <ol className="mt-2 space-y-2 text-sm max-h-60 overflow-y-auto">
              {blocks.map((block, i) => (
                <li
                  key={i}
                  className={`rounded border ${isChoosing ? "" : "p-2"} ${i === focus.index ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : ""}`}
                >
                  {isChoosing ? (
                    <button
                      type="button"
                      className="w-full min-h-11 p-2 text-left cursor-pointer disabled:opacity-60"
                      disabled={busy}
                      onClick={() => void startFrom(block.startStitch)}
                    >
                      {i + 1}. {threadLabel(block)}
                      {i === focus.index ? " · starts here" : ""}
                    </button>
                  ) : (
                    <>
                      {i + 1}. {threadLabel(block)}
                      {i === focus.index ? " · " + focus.label : ""}
                    </>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Pattern details and other actions
          </summary>
          <div className="mt-3 space-y-3">
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
            <Button
              variant="outline"
              className="w-full"
              onClick={onPrepare}
              disabled={u.uploading}
            >
              Review or choose a design on Prepare
            </Button>
            {uploaded &&
              canStartMaskTrace(m.status, current > 0) &&
              action.command !== "trace" && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void run("trace", true)}
                >
                  Trace outline again
                </Button>
              )}
            {uploaded &&
              canDeletePattern(m.status) &&
              action.command !== "delete" && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void run("delete", true)}
                >
                  Delete Pattern
                </Button>
              )}
          </div>
        </details>
      </div>
    </section>
  );
}
