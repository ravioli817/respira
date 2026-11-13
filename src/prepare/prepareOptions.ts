import { create } from "zustand";

const KEY = "respira:pauseAfterCuts";

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false; // storage can be unavailable, e.g. in a private window
  }
}

interface PrepareOptions {
  /**
   * Stop the machine after every thread cut, so the loose thread end can be held while it
   * starts again. Off by default: Brother's own conversion does not pause at cuts.
   */
  pauseAfterCuts: boolean;
  setPauseAfterCuts: (on: boolean) => void;
}

/** Choices made on the Prepare screen that change the bytes sent to the machine. */
export const usePrepareOptions = create<PrepareOptions>((set) => ({
  pauseAfterCuts: stored(),
  setPauseAfterCuts: (on) => {
    try {
      localStorage.setItem(KEY, String(on));
    } catch {
      // kept for this session only
    }
    set({ pauseAfterCuts: on });
  },
}));
