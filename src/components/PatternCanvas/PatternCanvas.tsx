// Changed in this fork (Respira with a Create screen): see "This fork" in README.md.
import { useRef, useMemo, useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useMachineStore,
  usePatternUploaded,
} from "../../stores/useMachineStore";
import { useMachineUploadStore } from "../../stores/useMachineUploadStore";
import { usePatternStore } from "../../stores/usePatternStore";
import { useProjectUi } from "../../projects/projectUi";
import { guessPxPerMM } from "../../studio/realSize.js";
import { Stage, Layer } from "react-konva";
import Konva from "konva";
import { HoopBackground } from "./HoopBackground";
import { HoopFabric, HoopFrame, HoopGuides } from "./HoopFrame";
import { MarkerTargets } from "./MarkerTargets";
import { PatternPositionIndicator } from "./PatternPositionIndicator";
import { PositionPresets } from "./PositionPresets";
import { ZoomControls } from "./ZoomControls";
import { PatternLayer } from "./PatternLayer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCanvasViewport, usePatternTransform } from "@/hooks";

/** The Skitch hoop, shown before a machine has said what it has (0.1 mm). */
const DEFAULT_HOOP = 1000;

/** Buttons that sit on the mat: white, so they read as tools laid on it. */
const MAT_BUTTON =
  "inline-flex items-center justify-center h-11 px-4 rounded-xl bg-paper text-ink font-normal cursor-pointer hover:bg-accent aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-white";

/**
 * The hoop on the cutting mat, with the design in it. Before a design is sent it can be dragged and
 * turned here; afterwards this is the live view of what has been stitched. Nothing floats over the
 * hoop: the controls sit in a row on the mat beneath it.
 */
export function PatternCanvas({
  quickPlacement = true,
}: {
  /** Show "Turn a quarter" and "Line up in the hoop" (Place). Dragging works either way. */
  quickPlacement?: boolean;
}) {
  // Machine store
  const { sewingProgress, machineInfo } = useMachineStore(
    useShallow((state) => ({
      sewingProgress: state.sewingProgress,
      machineInfo: state.machineInfo,
    })),
  );

  // Machine upload store
  const { isUploading } = useMachineUploadStore(
    useShallow((state) => ({
      isUploading: state.isUploading,
    })),
  );

  // Pattern store
  const {
    pesData,
    patternOffset: initialPatternOffset,
    patternRotation: initialPatternRotation,
    uploadedPesData,
    uploadedPatternOffset: initialUploadedPatternOffset,
    setPatternOffset,
    setPatternRotation,
  } = usePatternStore(
    useShallow((state) => ({
      pesData: state.pesData,
      patternOffset: state.patternOffset,
      patternRotation: state.patternRotation,
      uploadedPesData: state.uploadedPesData,
      uploadedPatternOffset: state.uploadedPatternOffset,
      setPatternOffset: state.setPatternOffset,
      setPatternRotation: state.setPatternRotation,
    })),
  );

  // Derived state: pattern is uploaded if machine has pattern info
  const patternUploaded = usePatternUploaded();
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);

  // Real size: one millimetre of hoop is one millimetre of screen, as on Create.
  const checkedPxPerMM = useProjectUi((s) => s.pxPerMM);
  const pxPerMM = useMemo(
    () => checkedPxPerMM ?? guessPxPerMM().v,
    [checkedPxPerMM],
  );
  const realScale = pxPerMM / 10;

  // Canvas viewport (zoom, pan, container size)
  const {
    stagePos,
    stageScale,
    initialScale,
    containerSize,
    handleWheel,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleStageDragStart,
    handleStageDragEnd,
  } = useCanvasViewport({
    containerRef,
    pesData,
    uploadedPesData,
    machineInfo,
    realScale,
  });

  // Handler for position preset selection
  const handlePositionPreset = useCallback(
    (offset: { x: number; y: number }) => {
      setPatternOffset(offset.x, offset.y);
    },
    [setPatternOffset],
  );

  // Pattern transform (position, rotation, drag/transform)
  const {
    localPatternOffset,
    localPatternRotation,
    patternGroupRef,
    transformerRef,
    attachTransformer,
    handlePatternDragEnd,
    handleTransformEnd,
  } = usePatternTransform({
    pesData,
    initialPatternOffset,
    initialPatternRotation,
    setPatternOffset,
    setPatternRotation,
    patternUploaded,
    isUploading,
  });

  // Light thread vanishes on pale fabric, so the fabric in the preview can be switched to dark.
  const [darkFabric, setDarkFabric] = useState(false);

  const hoopWidth = machineInfo?.maxWidth ?? DEFAULT_HOOP;
  const hoopHeight = machineInfo?.maxHeight ?? DEFAULT_HOOP;
  const hasPattern = !!(pesData || uploadedPesData);
  const locked = isUploading || patternUploaded || !!uploadedPesData;
  const movable = !!pesData && !locked;

  // The mat's lines carry on from the hoop's centimetre grid, and follow it while it is dragged.
  const placeMat = useCallback((x: number, y: number, scale: number) => {
    const el = sectionRef.current;
    if (!el) return;
    el.style.setProperty("--cm", `${100 * scale}px`);
    el.style.backgroundPosition = `${x}px ${y}px`;
  }, []);

  const zoomLabel =
    Math.abs(stageScale - realScale) < 0.001
      ? "Real size"
      : `${Math.round((stageScale / (realScale || initialScale)) * 100)}%`;

  return (
    <section
      ref={sectionRef}
      aria-label="Your design in the hoop"
      className="mat-surface flex-1 min-h-0 h-full flex flex-col"
      style={
        {
          "--cm": `${100 * stageScale}px`,
          backgroundPosition: `${stagePos.x}px ${stagePos.y}px`,
        } as React.CSSProperties
      }
    >
      <div
        className="relative w-full flex-1 min-h-[340px] lg:min-h-0 overflow-hidden"
        ref={containerRef}
      >
        {containerSize.width > 0 && (
          <Stage
            width={containerSize.width}
            height={containerSize.height}
            x={stagePos.x}
            y={stagePos.y}
            scaleX={stageScale}
            scaleY={stageScale}
            draggable
            onWheel={handleWheel}
            onPointerDown={(event) =>
              event.target
                .getStage()
                ?.container()
                .focus({ preventScroll: true })
            }
            onDragStart={handleStageDragStart}
            onDragMove={(event) => {
              const stage = event.target.getStage();
              if (stage && event.target === stage)
                placeMat(stage.x(), stage.y(), stage.scaleX());
            }}
            onDragEnd={handleStageDragEnd}
            ref={(node) => {
              stageRef.current = node;
              if (node) {
                node.container().tabIndex = 0;
                node
                  .container()
                  .setAttribute(
                    "aria-label",
                    "Embroidery placement canvas. Arrow keys move the design.",
                  );
                node.container().style.cursor = "grab";
                node.container().style.touchAction = "none";
              }
            }}
          >
            {/* Background layer: frame, fabric, hoop photo, guides - static, no event listening */}
            <Layer listening={false}>
              <HoopFrame
                width={hoopWidth}
                height={hoopHeight}
                scale={stageScale}
              />
              <HoopFabric
                width={hoopWidth}
                height={hoopHeight}
                scale={stageScale}
                dark={darkFabric}
              />
              {/* An aligned photo of the hooped fabric covers the plain fabric; the guides and the
                  design go on top of it. */}
              <HoopBackground />
              <MarkerTargets />
              <HoopGuides
                width={hoopWidth}
                height={hoopHeight}
                scale={stageScale}
                dark={darkFabric}
              />
            </Layer>

            {/* Original pattern layer: draggable with transformer (shown before upload starts) */}
            <Layer visible={!locked}>
              {pesData && (
                <PatternLayer
                  pesData={pesData}
                  offset={localPatternOffset}
                  rotation={localPatternRotation}
                  isInteractive={true}
                  showProgress={false}
                  currentStitchIndex={0}
                  patternGroupRef={patternGroupRef}
                  transformerRef={transformerRef}
                  onDragEnd={handlePatternDragEnd}
                  onTransformEnd={handleTransformEnd}
                  attachTransformer={attachTransformer}
                />
              )}
            </Layer>

            {/* Uploaded pattern layer: locked, rotation baked in (shown during and after upload) */}
            <Layer visible={locked}>
              {uploadedPesData && (
                <PatternLayer
                  pesData={uploadedPesData}
                  offset={initialUploadedPatternOffset}
                  isInteractive={false}
                  showProgress={true}
                  currentStitchIndex={sewingProgress?.currentStitch || 0}
                />
              )}
            </Layer>
          </Stage>
        )}
      </div>

      {/* Everything that used to float on the canvas sits under it, so the hoop is never covered */}
      <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-3 sm:px-5 pb-3 sm:pb-4 pt-1">
        {movable && quickPlacement && (
          <div
            className="flex flex-shrink-0 gap-2"
            role="group"
            aria-label="Quick placement"
          >
            <button
              type="button"
              className={MAT_BUTTON}
              onClick={() =>
                setPatternRotation((localPatternRotation + 90) % 360)
              }
            >
              Turn a quarter
            </button>
            {machineInfo && pesData && (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className={MAT_BUTTON}>
                    Line up in the hoop
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2">
                  <PositionPresets
                    pesData={pesData}
                    patternRotation={localPatternRotation}
                    machineInfo={machineInfo}
                    onPositionSelect={handlePositionPreset}
                    disabled={false}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
        <PatternPositionIndicator
          hasPattern={hasPattern}
          offset={locked ? initialUploadedPatternOffset : localPatternOffset}
          rotation={localPatternRotation}
          isLocked={patternUploaded || !!uploadedPesData}
          isUploading={isUploading}
        />
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            className={MAT_BUTTON}
            aria-pressed={darkFabric}
            onClick={() => setDarkFabric((value) => !value)}
          >
            Dark fabric
          </button>
          <ZoomControls
            label={zoomLabel}
            buttonClassName={MAT_BUTTON}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
          />
        </div>
      </div>
    </section>
  );
}
