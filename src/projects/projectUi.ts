import type { StudioSendResult } from "../studio/studioApp.js";
import { create } from "zustand";

/**
 * What the top bar needs to know about the design open on Create, and the two things it can ask
 * the editor to do. The editor (Studio) fills this in; the top bar only reads and calls.
 */
interface ProjectUi {
  /** The open design's name as typed, e.g. "my-drawing". */
  name: string;
  /** "Saved", "Saving…", "Not saved yet…". */
  status: string;
  /** Screen pixels per millimetre for real size, once the editor has worked it out. */
  pxPerMM: number | null;
  /** Opens the list of saved designs. */
  openProjects: () => void;
  /** Sends the drawing to Place, as the editor's Next button does. Distinguishes empty artwork from pending or invalid edits. */
  sendToPlace: () => StudioSendResult;
}

export const useProjectUi = create<ProjectUi>(() => ({
  name: "",
  status: "",
  pxPerMM: null,
  openProjects: () => {},
  sendToPlace: () => "blocked",
}));

/**
 * "My drawing" from "my-drawing" or "my-drawing.pes": design names are stored in a form that is
 * safe as a file name. A design that was never named travels as "design", which is no name at all,
 * so it comes back empty.
 */
export function displayName(name: string | null | undefined): string {
  const words = (name ?? "")
    .replace(/\.pes$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!words || words.toLowerCase() === "design") return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
