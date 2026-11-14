import type { ProjectData } from "../projects/projectFile";
/** Types for the plain-JavaScript Create screen in studioApp.js. */
export interface StudioDesign {
  name: string;
  projectId?: string;
  placement?: { x: number; y: number; rotation: number };
  /** Rows of [x, y, command, colourIndex] in 0.1 mm, centred on the hoop. */
  stitches: number[][];
  /** One entry per colour block, in sewing order. */
  threads: Array<{
    index: number;
    name: string;
    rgb: [number, number, number];
  }>;
}

export interface StudioOptions {
  /** Stylesheet text to put inside the shadow root. */
  css?: string;
  project?: ProjectData;
  onDirty?: () => void;
  onSave?: (data: ProjectData, thumbnail: string) => void;
  /** Looks up a palette colour's thread number, e.g. "Brother 509". Return "" when there is none. */
  threadCode?: (r: number, g: number, b: number) => string;
  /** Called with the design's name at the start and whenever it changes. */
  onName?: (name: string) => void;
  /** Called with screen pixels per millimetre at real size, as guessed for this device or checked with a card. */
  onScale?: (pxPerMM: number) => void;
  /** Called when "Next: place it in the hoop" is tapped. Return a message to show if the design cannot be taken. */
  onSend?: (design: StudioDesign) => string | null | undefined | void;
}

export function mountStudio(
  root: ShadowRoot | HTMLElement,
  opts?: StudioOptions,
): {
  destroy(): void;
  snapshot(): ProjectData;
  thumbnail(): string;
  /** Hands the design to onSend, as the Next button does. False when there is nothing to stitch yet. */
  send(): boolean;
  setPlacement(value: { x: number; y: number; rotation: number }): void;
};
