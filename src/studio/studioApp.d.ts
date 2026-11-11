/** Types for the plain-JavaScript Create screen in studioApp.js. */
export interface StudioDesign {
  name: string;
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
  /** Called when "Send to Skitch" is tapped. Return a message to show if the design cannot be taken. */
  onSend?: (design: StudioDesign) => string | null | undefined | void;
}

export function mountStudio(
  root: ShadowRoot | HTMLElement,
  opts?: StudioOptions,
): { destroy(): void };
