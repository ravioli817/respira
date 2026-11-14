// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
import { useMachineCacheStore } from "./useMachineCacheStore";
import { usePatternStore } from "./usePatternStore";
import { create } from "zustand";
import {
  BrotherPP1Service,
  BluetoothPairingError,
} from "../services/BrotherPP1Service";
import type {
  MachineInfo,
  PatternInfo,
  SewingProgress,
} from "../types/machine";
import { MachineStatus, MachineStatusNames } from "../types/machine";
import {
  SewingMachineError,
  getErrorStitchRollback,
} from "../utils/errorCodeHelpers";
import {
  getMachineStateCategory,
  hasLoadedPattern,
} from "../utils/machineStateHelpers";
import { uuidToString } from "../services/PatternCacheService";
import { createStorageService } from "../platform";
import type { IStorageService } from "../platform/interfaces/IStorageService";
import { useEventStore } from "./storeEvents";

interface MachineState {
  // Service instances
  service: BrotherPP1Service;
  storageService: IStorageService;

  // Connection state
  isConnected: boolean;
  machineInfo: MachineInfo | null;

  // Machine status
  machineStatus: MachineStatus;
  machineStatusName: string;
  machineError: number;

  // Pattern state
  patternInfo: PatternInfo | null;
  sewingProgress: SewingProgress | null;

  // Error state
  error: string | null;
  isPairingError: boolean;

  // Communication state
  isCommunicating: boolean;
  isDeleting: boolean;

  // Step control state
  adjustedStitchIndex: number | null;
  lastRolledBackError: number | null;
  pausedStitchIndex: number | null; // Position snapshot after pause + auto-rollback, before manual adjustments

  // Polling control
  pollIntervalId: NodeJS.Timeout | null;
  serviceCountIntervalId: NodeJS.Timeout | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshPatternInfo: () => Promise<void>;
  refreshProgress: () => Promise<void>;
  refreshServiceCount: () => Promise<void>;
  startMaskTrace: () => Promise<void>;
  startSewing: () => Promise<void>;
  resumeSewing: () => Promise<void>;
  deletePattern: () => Promise<void>;
  setStitchPosition: (index: number, maxStitches?: number) => Promise<void>;
  adjustStitchPosition: (offset: number, maxStitches?: number) => Promise<void>;

  // Initialization
  initialize: () => void;

  // Internal methods
  _setupSubscriptions: () => void;
  _startPolling: () => void;
  _stopPolling: () => void;
  _handleErrorStitchRollback: () => Promise<void>;
}

// Invalidates an in-flight poll when Bluetooth disconnects or polling restarts.
let pollingGeneration = 0;

export const useMachineStore = create<MachineState>((set, get) => ({
  // Initial state
  service: new BrotherPP1Service(),
  storageService: createStorageService(),
  isConnected: false,
  machineInfo: null,
  machineStatus: MachineStatus.None,
  machineStatusName: MachineStatusNames[MachineStatus.None] || "Unknown",
  machineError: SewingMachineError.None,
  patternInfo: null,
  sewingProgress: null,
  error: null,
  isPairingError: false,
  isCommunicating: false,
  isDeleting: false,
  adjustedStitchIndex: null,
  lastRolledBackError: null,
  pausedStitchIndex: null,
  pollIntervalId: null,
  serviceCountIntervalId: null,

  // Connect to machine
  connect: async () => {
    let generation = pollingGeneration;
    try {
      const { service } = get();
      set({ error: null, isPairingError: false });
      get()._stopPolling();
      generation = pollingGeneration;
      useMachineCacheStore.getState().clearResumeState();
      usePatternStore.getState().clearUploadedPattern();
      set({
        adjustedStitchIndex: null,
        lastRolledBackError: null,
        pausedStitchIndex: null,
        patternInfo: null,
        sewingProgress: null,
      });

      await service.connect();
      if (generation !== pollingGeneration) return;
      set({ isConnected: true });

      // Fetch initial machine info and status
      const info = await service.getMachineInfo();
      const state = await service.getMachineState();
      if (generation !== pollingGeneration) return;

      set({
        machineInfo: info,
        machineStatus: state.status,
        machineStatusName: MachineStatusNames[state.status] || "Unknown",
        machineError: state.error,
      });

      // Fetch sewing progress so we know if sewing was in progress before reconnect
      try {
        const progress = await service.getSewingProgress();
        if (generation !== pollingGeneration) return;
        set({
          sewingProgress: progress,
          // Reconnecting observes the existing pause; it must not apply another automatic rollback.
          pausedStitchIndex:
            getMachineStateCategory(state.status) === "interrupted" ||
            (state.status === MachineStatus.SEWING_WAIT &&
              progress.currentStitch > 0)
              ? progress.currentStitch
              : null,
        });
      } catch {
        // Not critical - polling will pick it up
      }

      // Live print status must not depend on this browser having a cached PES.
      await get().refreshPatternInfo();

      // Check for resume possibility using cache store
      await useMachineCacheStore.getState().checkResume();

      // Start polling only for the connection that completed this handshake.
      if (generation !== pollingGeneration) return;
      get()._startPolling();
    } catch (err) {
      if (generation !== pollingGeneration) return;
      console.log(err);
      const isPairing = err instanceof BluetoothPairingError;
      set({
        isPairingError: isPairing,
        error: err instanceof Error ? err.message : "Failed to connect",
        isConnected: false,
      });
    }
  },

  // Disconnect from machine
  disconnect: async () => {
    try {
      const { service, _stopPolling } = get();
      _stopPolling();

      await service.disconnect();
      useMachineCacheStore.getState().clearResumeState();
      usePatternStore.getState().clearUploadedPattern();
      set({
        isConnected: false,
        machineInfo: null,
        machineStatus: MachineStatus.None,
        machineStatusName: MachineStatusNames[MachineStatus.None] || "Unknown",
        patternInfo: null,
        sewingProgress: null,
        adjustedStitchIndex: null,
        lastRolledBackError: null,
        pausedStitchIndex: null,
        error: null,
        machineError: SewingMachineError.None,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to disconnect",
      });
    }
  },

  // Refresh machine status
  refreshStatus: async () => {
    const { isConnected, service } = get();
    if (!isConnected) return;
    const generation = pollingGeneration;

    try {
      const state = await service.getMachineState();
      if (!get().isConnected || generation !== pollingGeneration) return;
      set({
        machineStatus: state.status,
        machineStatusName: MachineStatusNames[state.status] || "Unknown",
        machineError: state.error,
      });
    } catch (err) {
      if (!get().isConnected || generation !== pollingGeneration) return;
      set({
        error: err instanceof Error ? err.message : "Failed to get status",
      });
    }
  },

  // Refresh pattern info
  refreshPatternInfo: async () => {
    const { isConnected, service } = get();
    if (!isConnected) return;
    const generation = pollingGeneration;

    try {
      const info = await service.getPatternInfo();
      if (!get().isConnected || generation !== pollingGeneration) return;
      // An empty response means there is no metadata yet, not an uploaded job.
      // Keep previously recovered metadata if the PP1 briefly reports zeros.
      if (info.totalStitches > 0) {
        set({ patternInfo: info, error: null });
      }
    } catch (err) {
      if (!get().isConnected || generation !== pollingGeneration) return;
      set({
        error:
          err instanceof Error ? err.message : "Failed to get pattern info",
      });
    }
  },

  // Refresh sewing progress
  refreshProgress: async () => {
    const { isConnected, service } = get();
    if (!isConnected) return;
    const generation = pollingGeneration;

    try {
      const progress = await service.getSewingProgress();
      if (!get().isConnected || generation !== pollingGeneration) return;
      set({ sewingProgress: progress });
    } catch (err) {
      if (!get().isConnected || generation !== pollingGeneration) return;
      set({
        error: err instanceof Error ? err.message : "Failed to get progress",
      });
    }
  },

  // Refresh service count
  refreshServiceCount: async () => {
    const { isConnected, machineInfo, service } = get();
    if (!isConnected || !machineInfo) return;
    const generation = pollingGeneration;

    try {
      const counts = await service.getServiceCount();
      if (!get().isConnected || generation !== pollingGeneration) return;
      set({
        machineInfo: {
          ...machineInfo,
          serviceCount: counts.serviceCount,
          totalCount: counts.totalCount,
        },
      });
    } catch (err) {
      console.warn("Failed to get service count:", err);
    }
  },

  // Start mask trace
  startMaskTrace: async () => {
    const { isConnected, service, refreshStatus } = get();
    if (!isConnected) return;

    try {
      set({ error: null });
      await service.startMaskTrace();
      await refreshStatus();
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to start mask trace",
      });
    }
  },

  // Start sewing
  startSewing: async () => {
    const { isConnected, service, refreshStatus } = get();
    if (!isConnected) return;

    try {
      set({
        error: null,
        adjustedStitchIndex: null,
        lastRolledBackError: null,
        pausedStitchIndex: null,
      });
      await service.startSewing();
      await refreshStatus();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to start sewing",
      });
    }
  },

  // Resume sewing
  resumeSewing: async () => {
    const { isConnected, service, refreshStatus } = get();
    if (!isConnected) return;

    try {
      set({
        error: null,
        adjustedStitchIndex: null,
        lastRolledBackError: null,
        pausedStitchIndex: null,
      });
      await service.resumeSewing();
      await refreshStatus();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to resume sewing",
      });
    }
  },

  // Delete pattern from machine
  deletePattern: async () => {
    const { isConnected, service, storageService, refreshStatus } = get();
    if (!isConnected) return;

    try {
      set({ error: null, isDeleting: true });

      // Keep the recovery copy until the machine confirms deletion.
      let machineUuid: Uint8Array | null = null;
      try {
        machineUuid = await service.getPatternUUID();
      } catch (err) {
        console.warn("[Cache] Could not read UUID before deletion:", err);
      }
      await service.deletePattern();
      if (machineUuid) {
        try {
          await storageService.deletePattern(uuidToString(machineUuid));
        } catch (err) {
          console.warn(
            "[Cache] Could not remove the deleted job's cache:",
            err,
          );
        }
      }

      // Clear machine-related state
      set({
        patternInfo: null,
        sewingProgress: null,
        adjustedStitchIndex: null,
        lastRolledBackError: null,
        pausedStitchIndex: null,
      });

      // Emit pattern deleted event for other stores to react
      useEventStore.getState().emitPatternDeleted();

      await refreshStatus();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to delete pattern",
      });
    } finally {
      set({ isDeleting: false });
    }
  },

  // Set stitch position to an absolute index
  setStitchPosition: async (index: number, maxStitches?: number) => {
    const { isConnected, service, patternInfo } = get();
    if (!isConnected) return;

    const totalStitches = maxStitches ?? patternInfo?.totalStitches ?? 0;
    const clamped = Math.max(0, Math.min(index, totalStitches));
    const generation = pollingGeneration;

    try {
      await service.setStitchIndex(clamped);
      if (!get().isConnected || generation !== pollingGeneration) return;
      set({ adjustedStitchIndex: clamped });
      // Refresh progress so UI reflects the new position
      await get().refreshProgress();
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to set stitch position",
      });
    }
  },

  // Adjust stitch position by a relative offset
  adjustStitchPosition: async (offset: number, maxStitches?: number) => {
    const { sewingProgress, adjustedStitchIndex } = get();
    const currentIndex =
      adjustedStitchIndex ?? sewingProgress?.currentStitch ?? 0;
    await get().setStitchPosition(currentIndex + offset, maxStitches);
  },

  // Handle automatic stitch rollback for thread errors
  _handleErrorStitchRollback: async () => {
    const { machineError, sewingProgress, service, lastRolledBackError } =
      get();

    const generation = pollingGeneration;
    if (!get().isConnected) return;
    const rollback = getErrorStitchRollback(machineError);
    if (rollback === null) return;
    if (machineError === lastRolledBackError) return;

    const currentStitch = sewingProgress?.currentStitch ?? 0;
    const newIndex = Math.max(0, currentStitch - rollback);

    console.log(
      `[StepControl] Auto-rollback: stitch ${currentStitch} -> ${newIndex} (error 0x${machineError.toString(16)}, rollback ${rollback})`,
    );

    try {
      await service.setStitchIndex(newIndex);
      if (!get().isConnected || generation !== pollingGeneration) return;
      set({
        adjustedStitchIndex: newIndex,
        lastRolledBackError: machineError,
      });
      // Immediately refresh progress so subsequent polls see consistent state
      await get().refreshProgress();
    } catch (err) {
      console.error("[StepControl] Failed to rollback stitch position:", err);
    }
  },

  // Initialize the store (call once from App component)
  initialize: () => {
    get()._setupSubscriptions();
  },

  // Setup service subscriptions
  _setupSubscriptions: () => {
    const { service } = get();

    // Subscribe to communication state changes
    service.onCommunicationChange((isCommunicating) => {
      set({ isCommunicating });
    });

    // Subscribe to disconnect events
    service.onDisconnect(() => {
      console.log("[useMachineStore] Device disconnected");
      useMachineCacheStore.getState().clearResumeState();
      usePatternStore.getState().clearUploadedPattern();
      get()._stopPolling();
      set({
        isConnected: false,
        machineInfo: null,
        machineStatus: MachineStatus.None,
        machineStatusName: MachineStatusNames[MachineStatus.None] || "Unknown",
        machineError: SewingMachineError.None,
        patternInfo: null,
        sewingProgress: null,
        adjustedStitchIndex: null,
        lastRolledBackError: null,
        pausedStitchIndex: null,
        error: "Device disconnected",
        isPairingError: false,
      });
    });
  },

  // Start polling for status updates
  _startPolling: () => {
    const {
      _stopPolling,
      refreshStatus,
      refreshProgress,
      refreshServiceCount,
      refreshPatternInfo,
    } = get();

    // Stop any existing polling
    _stopPolling();
    const generation = pollingGeneration;
    const isCurrentPoll = () =>
      get().isConnected && generation === pollingGeneration;

    // Function to determine polling interval based on machine status
    const getPollInterval = () => {
      const status = get().machineStatus;

      // Fast polling for active states
      if (
        status === MachineStatus.SEWING ||
        status === MachineStatus.MASK_TRACING ||
        status === MachineStatus.SEWING_DATA_RECEIVE
      ) {
        return 1000;
      } else if (
        status === MachineStatus.COLOR_CHANGE_WAIT ||
        status === MachineStatus.MASK_TRACE_LOCK_WAIT ||
        status === MachineStatus.SEWING_WAIT
      ) {
        return 1000;
      }
      return 2000; // Default for idle states
    };

    // Main polling function
    const poll = async () => {
      if (!isCurrentPoll()) return;
      await refreshStatus();
      if (!isCurrentPoll()) return;

      const currentState = get();
      const category = getMachineStateCategory(currentState.machineStatus);

      // Capture the stitch reached at color changes, pauses and completion too.
      if (
        currentState.patternInfo !== null ||
        hasLoadedPattern(currentState.machineStatus)
      ) {
        await refreshProgress();
      }
      if (!isCurrentPoll()) return;

      // Reset step control state when machine is actively sewing
      if (category === "active") {
        if (
          currentState.adjustedStitchIndex !== null ||
          currentState.lastRolledBackError !== null ||
          currentState.pausedStitchIndex !== null
        ) {
          set({
            adjustedStitchIndex: null,
            lastRolledBackError: null,
            pausedStitchIndex: null,
          });
        }
      }
      // Note: we intentionally do NOT clear lastRolledBackError when the error clears
      // while still paused, so the rollback info text remains visible to the user.

      // Auto-rollback for thread errors when machine is interrupted or paused mid-sew
      // Only runs once on entering paused state (when pausedStitchIndex is not yet set)
      const isInterruptedOrPausedMidSew =
        category === "interrupted" ||
        (currentState.machineStatus === MachineStatus.SEWING_WAIT &&
          (currentState.sewingProgress?.currentStitch ?? 0) > 0);
      if (isInterruptedOrPausedMidSew && get().pausedStitchIndex === null) {
        // Refresh progress so rollback has accurate current stitch
        await get().refreshProgress();
        if (!isCurrentPoll()) return;
        await get()._handleErrorStitchRollback();
        if (!isCurrentPoll()) return;

        // Snapshot the paused position (after rollback, before manual adjustments)
        const postRollbackStitch =
          get().adjustedStitchIndex ?? get().sewingProgress?.currentStitch ?? 0;
        set({ pausedStitchIndex: postRollbackStitch });
      }

      // Retry missing metadata independently of the local pattern cache.
      if ((get().patternInfo?.totalStitches ?? 0) === 0) {
        await refreshPatternInfo();
      }
      if (!isCurrentPoll()) return;

      // A UUID read can fail briefly after reconnect. Retry artwork recovery
      // without making live progress depend on its success.
      if (useMachineCacheStore.getState().resumeCheckPending) {
        await useMachineCacheStore.getState().checkResume();
      }
      if (!isCurrentPoll()) return;

      // Schedule next poll with updated interval
      const newInterval = getPollInterval();
      const pollIntervalId = setTimeout(poll, newInterval);
      set({ pollIntervalId });
    };

    // Start polling
    const initialInterval = getPollInterval();
    const pollIntervalId = setTimeout(poll, initialInterval);

    // Service count polling (every 10 seconds)
    const serviceCountIntervalId = setInterval(refreshServiceCount, 10000);

    set({ pollIntervalId, serviceCountIntervalId });
  },

  // Stop polling
  _stopPolling: () => {
    pollingGeneration++;
    const { pollIntervalId, serviceCountIntervalId } = get();

    if (pollIntervalId) {
      clearTimeout(pollIntervalId);
      set({ pollIntervalId: null });
    }

    if (serviceCountIntervalId) {
      clearInterval(serviceCountIntervalId);
      set({ serviceCountIntervalId: null });
    }
  },
}));

// Selector hooks for common use cases
export const useIsConnected = () =>
  useMachineStore((state) => state.isConnected);
export const useMachineInfo = () =>
  useMachineStore((state) => state.machineInfo);
export const useMachineStatus = () =>
  useMachineStore((state) => state.machineStatus);
export const useMachineError = () =>
  useMachineStore((state) => state.machineError);
export const usePatternInfo = () =>
  useMachineStore((state) => state.patternInfo);
export const useSewingProgress = () =>
  useMachineStore((state) => state.sewingProgress);
export const useAdjustedStitchIndex = () =>
  useMachineStore((state) => state.adjustedStitchIndex);
export const useLastRolledBackError = () =>
  useMachineStore((state) => state.lastRolledBackError);
export const usePausedStitchIndex = () =>
  useMachineStore((state) => state.pausedStitchIndex);
export const selectPatternUploaded = (
  state: Pick<MachineState, "patternInfo" | "machineStatus">,
) => state.patternInfo !== null || hasLoadedPattern(state.machineStatus);

// The PP1's live state also confirms a loaded pattern while metadata recovers.
export const usePatternUploaded = () => useMachineStore(selectPatternUploaded);
