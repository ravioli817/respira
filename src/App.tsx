// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
import { restoreCachedPattern } from "./prepare/restoreCachedPattern";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMachineStore } from "./stores/useMachineStore";
import { useMachineCacheStore } from "./stores/useMachineCacheStore";
import { usePatternStore } from "./stores/usePatternStore";
import { useUIStore } from "./stores/useUIStore";
import { AppHeader } from "./components/AppHeader";
import { LeftSidebar } from "./components/LeftSidebar";
import { PatternCanvas } from "./components/PatternCanvas";
import { PatternCanvasPlaceholder } from "./components/PatternCanvasPlaceholder";
import { BluetoothDevicePicker } from "./components/BluetoothDevicePicker";
import { PrepareScreen } from "./prepare/PrepareScreen";
import { ConnectionBar } from "./prepare/ConnectionBar";
import { Studio } from "./studio/Studio";
import { ScreenTabs, type Screen } from "./studio/ScreenTabs";
import { loadStudioDesign } from "./studio/loadStudioDesign";
import type { StudioDesign } from "./studio/studioApp.js";
import { PracticePanel } from "./practice/PracticePanel";
import { useNextStep } from "./guide/useNextStep";
import "./App.css";

function App() {
  // Set page title with version
  useEffect(() => {
    document.title = `Respira v${__APP_VERSION__}`;
  }, []);

  // Initialize machine store subscriptions (once on mount)
  useEffect(() => {
    useMachineStore.getState().initialize();
  }, []);

  // Machine cache store - for auto-loading cached pattern
  const { resumedPattern, resumeFileName } = useMachineCacheStore(
    useShallow((state) => ({
      resumedPattern: state.resumedPattern,
      resumeFileName: state.resumeFileName,
    })),
  );

  // Which screen is showing: making a design, or running the machine
  const [screen, setScreen] = useState<Screen>("create");
  // What the machine is waiting for, so the Stitch tab can call for attention from other screens
  const nextStep = useNextStep();

  // A design sent from the Create screen lands where a loaded PES file would, then the Prepare screen opens
  const handleStudioSend = useCallback((design: StudioDesign) => {
    const refusal = loadStudioDesign(design);
    if (refusal === null) setScreen("prepare");
    return refusal;
  }, []);

  // Pattern store - for auto-loading cached pattern
  const {
    pesData,
    uploadedPesData,
    currentFileName,
    setPattern,
    setUploadedPattern,
    setPatternRotation,
    setPatternOffset,
  } = usePatternStore(
    useShallow((state) => ({
      pesData: state.pesData,
      uploadedPesData: state.uploadedPesData,
      currentFileName: state.uploadedPesData
        ? state.uploadedFileName || state.currentFileName
        : state.currentFileName,
      setPattern: state.setPattern,
      setUploadedPattern: state.setUploadedPattern,
      setPatternRotation: state.setPatternRotation,
      setPatternOffset: state.setPatternOffset,
    })),
  );

  // UI store - for Pyodide initialization
  const { initializePyodide } = useUIStore(
    useShallow((state) => ({
      initializePyodide: state.initializePyodide,
    })),
  );

  // Initialize Pyodide in background on mount (non-blocking thanks to worker)
  useEffect(() => {
    initializePyodide();
  }, [initializePyodide]);

  // Recover the actual machine job even when a different local draft is open.
  useEffect(() => {
    if (!resumedPattern || uploadedPesData) return;
    const restored = restoreCachedPattern(resumedPattern);
    if (!pesData) {
      setPattern(restored.original, resumeFileName || "");
      setPatternOffset(restored.originalOffset.x, restored.originalOffset.y);
      setPatternRotation(restored.rotation);
    }
    setUploadedPattern(
      restored.uploaded,
      restored.uploadedOffset,
      resumeFileName || undefined,
    );
  }, [
    resumedPattern,
    resumeFileName,
    uploadedPesData,
    pesData,
    setPattern,
    setPatternOffset,
    setPatternRotation,
    setUploadedPattern,
  ]);

  return (
    <div className="h-dvh flex flex-col bg-gray-100 dark:bg-gray-900 overflow-hidden">
      {/* Full header with the workflow steps on Stitch; one short line elsewhere, so the hoop has room */}
      <AppHeader compact={screen !== "stitch"} />
      <ScreenTabs
        screen={screen}
        onChange={setScreen}
        patternName={pesData || uploadedPesData ? currentFileName : undefined}
        trailing={<ConnectionBar statusOnly={screen === "stitch"} />}
        stitchNeedsYou={screen !== "stitch" && !!nextStep?.needsPerson}
      />

      {/* Create screen - stays mounted so a drawing in progress survives a visit to the Stitch screen */}
      <Studio
        className={
          screen === "create"
            ? "flex-1 min-h-0 flex flex-col overflow-hidden"
            : "hidden"
        }
        onSend={handleStudioSend}
      />

      {screen === "prepare" && (
        <PrepareScreen
          onContinue={() => setScreen("stitch")}
          onCreate={() => setScreen("create")}
        />
      )}

      <div
        className={
          screen === "stitch"
            ? "flex-1 p-4 sm:p-5 lg:p-6 w-full overflow-y-auto lg:overflow-hidden flex flex-col"
            : "hidden"
        }
      >
        <div className="flex-1 grid grid-cols-1 content-start lg:content-normal lg:grid-cols-[480px_1fr] gap-4 md:gap-5 lg:gap-6 lg:overflow-hidden">
          {/* Left Column - Controls */}
          <LeftSidebar onPrepare={() => setScreen("prepare")} />

          {/* Right Column - Pattern Preview */}
          <div className="flex flex-col lg:overflow-hidden lg:h-full">
            {pesData || uploadedPesData ? (
              <PatternCanvas />
            ) : (
              <PatternCanvasPlaceholder />
            )}
          </div>
        </div>
      </div>

      <BluetoothDevicePicker />
      {/* Pretend machine buttons (only with ?practice in the address) */}
      <PracticePanel />
    </div>
  );
}

export default App;
