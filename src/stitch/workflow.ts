import { MachineStatus } from "../types/machine";
import {
  canUploadPattern,
  canResumeSewing,
  canDeletePattern,
} from "../utils/machineStateHelpers";
import { hasError, getErrorDetails } from "../utils/errorCodeHelpers";
import { upcomingBlockIndex } from "../guide/nextStep";
import type { ColorBlock } from "../components/ProgressMonitor/types";
export type StitchCommand =
  | "connect"
  | "prepare"
  | "upload"
  | "trace"
  | "start"
  | "resume"
  | "delete";
export interface WorkflowState {
  connected: boolean;
  status: MachineStatus;
  error: number | undefined;
  hasPattern: boolean;
  uploaded: boolean;
  uploading: boolean;
  deleting: boolean;
  current: number;
  total: number;
  /** The machine reported this job complete (see jobState.ts). */
  finished?: boolean;
}
export interface StitchAction {
  kind: "app" | "machine" | "wait";
  label: string;
  command?: StitchCommand;
}
/** Chooses a single primary action. Physical buttons are instructions, never remote commands. */
export function stitchAction(s: WorkflowState): StitchAction {
  if (s.uploading) return { kind: "wait", label: "Uploading the design…" };
  if (s.deleting)
    return { kind: "wait", label: "Deleting the machine pattern…" };
  if (!s.connected)
    return { kind: "app", command: "connect", label: "Connect to Machine" };
  const error = hasError(s.error) ? getErrorDetails(s.error) : null;
  if (s.status === MachineStatus.Initial || error?.isInformational)
    return {
      kind: "machine",
      label: "Remove the hoop, then press Accept on the machine",
    };
  if (
    s.status === MachineStatus.HOOP_AVOIDANCE ||
    s.status === MachineStatus.HOOP_AVOIDANCEING
  )
    return { kind: "wait", label: "Wait for the frame to stop moving" };
  if (
    s.status === MachineStatus.None ||
    s.status === MachineStatus.TryConnecting
  )
    return { kind: "wait", label: "Reading machine status…" };
  if (s.status === MachineStatus.SEWING_DATA_RECEIVE)
    return {
      kind: "wait",
      label: "Waiting for the machine to finish receiving data",
    };
  // The machine may retain the thread error until Resume is requested after rethreading.
  if (s.uploaded && canResumeSewing(s.status))
    return { kind: "app", command: "resume", label: "Resume Sewing" };
  if (error)
    return {
      kind: "machine",
      label: "Resolve the machine error before continuing",
    };
  if (s.status === MachineStatus.SEWING)
    return {
      kind: "machine",
      label: "To pause, press Start/Stop on the machine",
    };
  if (!s.uploaded) {
    if (!canUploadPattern(s.status))
      return { kind: "wait", label: "Wait for the machine to be ready" };
    return s.hasPattern
      ? { kind: "app", command: "upload", label: "Upload prepared design" }
      : { kind: "app", command: "prepare", label: "Choose a design" };
  }
  switch (s.status) {
    case MachineStatus.MASK_TRACE_LOCK_WAIT:
      return {
        kind: "machine",
        label: "Press Accept on the machine to trace the outline",
      };
    case MachineStatus.MASK_TRACING:
      return { kind: "wait", label: "Tracing the outline…" };
    case MachineStatus.MASK_TRACE_COMPLETE:
      return { kind: "app", command: "start", label: "Start Sewing" };
    case MachineStatus.SEWING_WAIT:
      return {
        kind: "machine",
        label: `Press Start/Stop on the machine to ${s.current > 0 ? "continue" : "begin"}`,
      };
    case MachineStatus.COLOR_CHANGE_WAIT:
      return {
        kind: "machine",
        label: "Change the thread, then press Start/Stop on the machine",
      };
    case MachineStatus.STOP:
      return {
        kind: "machine",
        label: "Resolve the issue, then press Accept on the machine",
      };
    case MachineStatus.SEWING_COMPLETE:
      return {
        kind: "machine",
        label: "Remove the fabric, then press Accept on the machine",
      };
    case MachineStatus.IDLE:
      // After a finished job the machine is idle with the design still loaded. Offering
      // "Trace outline" then would lead straight to sewing it a second time.
      if (
        (s.finished || (s.total > 0 && s.current >= s.total)) &&
        canDeletePattern(s.status)
      )
        return {
          kind: "app",
          command: "delete",
          label: "Delete finished pattern",
        };
      return { kind: "app", command: "trace", label: "Trace outline" };
    default:
      return { kind: "wait", label: "Waiting for the machine to be ready" };
  }
}
export function threadFocus(
  blocks: ColorBlock[],
  status: MachineStatus,
  current: number,
) {
  if (!blocks.length)
    return { index: -1, current: null, next: null, label: "Current thread" };
  const found = blocks.findIndex((b) => current <= b.endStitch);
  const index =
    status === MachineStatus.COLOR_CHANGE_WAIT
      ? upcomingBlockIndex(blocks, current)
      : status === MachineStatus.SEWING_COMPLETE
        ? blocks.length - 1
        : found < 0
          ? blocks.length - 1
          : found;
  return {
    index,
    current: blocks[index],
    next: blocks[index + 1] || null,
    label:
      status === MachineStatus.COLOR_CHANGE_WAIT
        ? "Load now"
        : status === MachineStatus.SEWING_COMPLETE
          ? "Last thread"
          : current === 0
            ? "Load first"
            : "Current thread",
  };
}
