// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
import { restoreCachedPattern } from "./prepare/restoreCachedPattern";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMachineStore } from "./stores/useMachineStore";
import { useMachineCacheStore } from "./stores/useMachineCacheStore";
import { usePatternStore } from "./stores/usePatternStore";
import { useUIStore } from "./stores/useUIStore";
import { LeftSidebar } from "./components/LeftSidebar";
import { PatternCanvas } from "./components/PatternCanvas";
import { BluetoothDevicePicker } from "./components/BluetoothDevicePicker";
import { PrepareScreen } from "./prepare/PrepareScreen";
import { Studio } from "./studio/Studio";
import { TopBar, type Screen } from "./shell/TopBar";
import { useProjectUi } from "./projects/projectUi";
import { selectPatternUploaded } from "./stores/useMachineStore";
import { useMachineUploadStore } from "./stores/useMachineUploadStore";
import { loadStudioDesign } from "./studio/loadStudioDesign";
import type { StudioDesign } from "./studio/studioApp.js";
import { PracticePanel } from "./practice/PracticePanel";
import { useNextStep } from "./guide/useNextStep";
import "./App.css";

function App() {
  // Set page title with version
  useEffect(() => {
    document.title = `Stitch Sketchbook v${__APP_VERSION__}`;
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

  // A design sent from the Create screen lands where a loaded PES file would, then the Place screen opens
  const handleStudioSend = useCallback((design: StudioDesign) => {
    const refusal = loadStudioDesign(design);
    if (refusal === null) setScreen("prepare");
    return refusal;
  }, []);

  // Tapping the Place step from Create carries the drawing over, exactly as the Next button does.
  // It only switches screens when Place is showing something a drawing must not replace: the job
  // the machine holds, or an embroidery file opened on Place.
  const goTo = useCallback(
    (next: Screen) => {
      if (next === "prepare" && screen === "create") {
        const pattern = usePatternStore.getState();
        const machineBusy =
          selectPatternUploaded(useMachineStore.getState()) ||
          useMachineUploadStore.getState().isUploading ||
          !!pattern.uploadedPesData;
        const openedFile = !!pattern.pesData && !pattern.sourceProjectId;
        if (!machineBusy && !openedFile) {
          const result = useProjectUi.getState().sendToPlace();
          // Pending or invalid edits stay on Create; a genuinely empty design opens
          // empty Place for PES import, never the previous project's stitch snapshot.
          if (result !== "empty") return;
          if (pattern.pesData)
            usePatternStore.setState({
              pesData: null,
              currentFileName: "",
              sourceProjectId: null,
              patternOffset: { x: 0, y: 0 },
              patternRotation: 0,
            });
        }
      }
      setScreen(next);
    },
    [screen],
  );

  // Pattern store - for auto-loading cached pattern
  const {
    pesData,
    uploadedPesData,
    setPattern,
    setUploadedPattern,
    setPatternRotation,
    setPatternOffset,
  } = usePatternStore(
    useShallow((state) => ({
      pesData: state.pesData,
      uploadedPesData: state.uploadedPesData,
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
    <div className="h-dvh flex flex-col bg-page text-ink overflow-hidden">
      <TopBar
        screen={screen}
        onChange={goTo}
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
        onOpened={() => setScreen("create")}
      />

      {screen === "prepare" && (
        <PrepareScreen
          onContinue={() => setScreen("stitch")}
          onCreate={() => setScreen("create")}
        />
      )}

      {/* Stitch stays mounted too: its panel watches the job and chimes from any screen */}
      <div
        className={
          screen === "stitch"
            ? "flex-1 min-h-0 w-full overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] content-start lg:content-normal"
            : "hidden"
        }
      >
        {/* Left: what to do now, progress and threads */}
        <LeftSidebar onPrepare={() => setScreen("prepare")} />

        {/* Right: the hoop on the cutting mat */}
        <div className="flex flex-col min-h-[min(34rem,100vw)] lg:min-h-0 lg:h-full">
          <PatternCanvas quickPlacement={false} />
        </div>
      </div>

      <BluetoothDevicePicker />
      {/* Pretend machine buttons (only with ?practice in the address) */}
      <PracticePanel />
    </div>
  );
}

export default App;
