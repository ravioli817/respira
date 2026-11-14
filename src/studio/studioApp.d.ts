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
  /** Called when the toolbar's Projects button is tapped. The button is hidden without it. */
  onProjects?: () => void;
  /** Called when "Prepare to stitch" is tapped. Return a message to show if the design cannot be taken. */
  onSend?: (design: StudioDesign) => string | null | undefined | void;
}

export function mountStudio(
  root: ShadowRoot | HTMLElement,
  opts?: StudioOptions,
): {
  destroy(): void;
  snapshot(): ProjectData;
  thumbnail(): string;
  /** Text for the save status shown in the toolbar, e.g. "Saved". */
  setProjectStatus(text: string): void;
  setPlacement(value: { x: number; y: number; rotation: number }): void;
};
