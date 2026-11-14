/**
 * "What to do now", in plain words, for whatever the machine is doing. This only reads state that the
 * rest of the app already tracks; it sends nothing to the machine.
 */
import { MachineStatus } from "../types/machine";
import {
  getErrorDetails,
  hasError,
  SewingMachineError,
} from "../utils/errorCodeHelpers";
import type { ColorBlock } from "../components/ProgressMonitor/types";
import { classifyMachineStop } from "../utils/colorBlockHelpers";

export type NextStepTone = "info" | "action" | "progress" | "problem" | "done";

export interface NextStep {
  tone: NextStepTone;
  title: string;
  lines: string[];
  /** True when the person has to come and do something, so a sound is worth making. */
  needsPerson: boolean;
  /**
   * The thread this step is about, when it is about one thread. The Stitch screen shows it as a
   * large spool with `lead` above the name ("Change the thread to" / "Yellow"), big enough to read
   * from across the table; `title` says the same in one sentence.
   */
  spool?: { lead: string; block: ColorBlock };
}

/**
 * How the Stitch screen colours a step: tape yellow when it is the person's turn, pin red for a
 * fault, mat green while the machine is busy by itself, plain paper otherwise.
 */
export type StepLook = "yours" | "fault" | "machine" | "plain";
export function stepLook(step: NextStep): StepLook {
  if (step.tone === "problem") return "fault";
  if (step.needsPerson || step.tone === "action") return "yours";
  if (step.tone === "progress") return "machine";
  return "plain";
}

export interface NextStepInput {
  isConnected: boolean;
  machineStatus: MachineStatus;
  machineError: number | undefined;
  hasPattern: boolean;
  patternUploaded: boolean;
  isUploading: boolean;
  currentStitch: number;
  colorBlocks: ColorBlock[];
  /** The machine reported this job complete (see stitch/jobState.ts). */
  finished?: boolean;
  /** Stitch indices where the machine pauses after a cut without a new thread. */
  trimStops?: readonly number[];
  /** Not connected, but a design was sent to the machine earlier in this session. */
  connectionLost?: boolean;
}

const ACCEPT = "the Accept button on the machine";
const START_STOP = "the Start/Stop button on the machine";

/** Thread faults in plain words. `thread` is the one that should be in the machine. */
const PLAIN_FAULTS: Record<
  number,
  { title: string; steps: (thread: string) => string[] } | undefined
> = {
  [SewingMachineError.UpperThreadError]: {
    title: "The upper thread broke or ran out",
    steps: (thread) => [
      `Rethread the machine with ${thread}.`,
      "If it keeps breaking, put in a new needle and rethread.",
    ],
  },
  [SewingMachineError.UpperThreadSewingStartError]: {
    title: "The upper thread is not threaded properly",
    steps: (thread) => [
      `Press ${ACCEPT}.`,
      `Rethread the machine with ${thread}.`,
      "If it happens again, put in a new needle and rethread.",
    ],
  },
  [SewingMachineError.LowerThreadError]: {
    title: "The bobbin thread is almost empty",
    steps: () => [
      "Put in a full bobbin.",
      "To refill the empty one, wind thread onto it the way the manual shows.",
    ],
  },
};

/** "Pink (Brother #085)" from a color block's thread details. */
export function threadLabel(block: ColorBlock | undefined): string {
  if (!block) return "the next thread";
  const name = block.threadDescription
    ? block.threadDescription.charAt(0).toUpperCase() +
      block.threadDescription.slice(1).toLowerCase()
    : "this color";
  return block.threadCatalogNumber
    ? `${name} (Brother #${block.threadCatalogNumber})`
    : name;
}

/** A thread's name and its catalog number apart, for showing them at different sizes. */
export function threadParts(block: ColorBlock | undefined): {
  name: string;
  catalog: string;
} {
  const name = block?.threadDescription
    ? block.threadDescription.charAt(0).toUpperCase() +
      block.threadDescription.slice(1).toLowerCase()
    : "";
  return {
    name,
    catalog: block?.threadCatalogNumber
      ? `Brother ${block.threadCatalogNumber}`
      : "",
  };
}

/** The block being stitched, or the last one once the count runs past the end. */
export function currentBlockIndex(
  colorBlocks: ColorBlock[],
  currentStitch: number,
): number {
  const index = colorBlocks.findIndex(
    (block) => currentStitch <= block.endStitch,
  );
  return index === -1 ? colorBlocks.length - 1 : index;
}

/**
 * The thread to load at a color-change stop. The machine is sitting on a boundary between two blocks,
 * but its reported count can be a few stitches either side of it, so go by the nearest boundary.
 */
export function upcomingBlockIndex(
  colorBlocks: ColorBlock[],
  currentStitch: number,
): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < colorBlocks.length - 1; i++) {
    const distance = Math.abs(colorBlocks[i].endStitch - currentStitch);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i + 1;
    }
  }
  return Math.min(best, colorBlocks.length - 1);
}

export function getNextStep(input: NextStepInput): NextStep | null {
  const {
    isConnected,
    machineStatus: status,
    machineError,
    hasPattern,
    patternUploaded,
    isUploading,
    currentStitch,
    colorBlocks,
    finished = false,
    trimStops = [],
    connectionLost = false,
  } = input;

  if (!isConnected && connectionLost) {
    return {
      tone: "problem",
      title: "The connection dropped. Tap Connect to Machine",
      lines: [
        "The machine still holds the design. Reconnecting picks the job up where it is: nothing is sent again.",
        "Keep this screen awake and near the machine so it stays connected.",
      ],
      needsPerson: true,
    };
  }
  if (!isConnected) {
    return {
      tone: "info",
      title: "Turn on the Skitch, then tap Connect to Machine",
      lines: [
        "Keep this screen open and nearby while it stitches. The app has to stay in touch with the machine.",
      ],
      needsPerson: false,
    };
  }

  const error = hasError(machineError) ? getErrorDetails(machineError) : null;

  // The machine has to find its starting position once after being switched on
  if (status === MachineStatus.Initial || error?.isInformational) {
    return {
      tone: "action",
      title: "Get the machine ready",
      lines: [
        "Take the frame off the machine.",
        `Press ${ACCEPT}.`,
        "When it stops moving, put the frame back on.",
      ],
      needsPerson: false,
    };
  }

  if (error) {
    const sewing = currentStitch > 0;
    // The thread faults happen to everyone, so they get plain words and the name of the thread
    // to put back. Everything else keeps the machine's own text.
    const plain = PLAIN_FAULTS[machineError as number];
    const thread = colorBlocks.length
      ? threadLabel(colorBlocks[currentBlockIndex(colorBlocks, currentStitch)])
      : "the same thread";
    return {
      tone: "problem",
      title: plain?.title ?? error.title,
      lines: [
        ...(plain ? plain.steps(thread) : error.solutions),
        ...(sewing
          ? [`When it is fixed, tap Resume Sewing, then press ${START_STOP}.`]
          : []),
      ],
      needsPerson: true,
    };
  }

  if (isUploading || status === MachineStatus.SEWING_DATA_RECEIVE) {
    return {
      tone: "progress",
      title: "Sending the design to the machine",
      lines: ["This takes a few seconds."],
      needsPerson: false,
    };
  }

  if (status === MachineStatus.None || status === MachineStatus.TryConnecting) {
    return {
      tone: "progress",
      title: "Reading machine status",
      lines: ["Wait for the machine to report its state."],
      needsPerson: false,
    };
  }
  if (
    status === MachineStatus.HOOP_AVOIDANCE ||
    status === MachineStatus.HOOP_AVOIDANCEING
  ) {
    return {
      tone: "progress",
      title: "The machine is moving the frame",
      lines: ["Wait for it to stop."],
      needsPerson: false,
    };
  }
  // Idle with the finished design still loaded. Without this the card would say to trace the
  // outline, and the next tap after that sews the design again.
  if (
    patternUploaded &&
    status === MachineStatus.IDLE &&
    (finished ||
      (colorBlocks.length > 0 &&
        currentStitch >= colorBlocks[colorBlocks.length - 1].endStitch))
  ) {
    return {
      tone: "done",
      title: "Ready for a new design",
      lines: ["Delete the finished design from the machine to stitch another."],
      needsPerson: false,
    };
  }
  if (!patternUploaded) {
    return hasPattern
      ? {
          tone: "action",
          title: "Send your design to the machine",
          lines: [
            "It will stitch where you put it on Place. Tap Send to the machine.",
          ],
          needsPerson: false,
        }
      : {
          tone: "info",
          title: "Pick a design",
          lines: [
            "Draw one on Create, then tap Place. Or open an embroidery file on Place.",
          ],
          needsPerson: false,
        };
  }

  // The thread the job starts with: the first, unless a later thread was chosen as the start.
  const firstThread = threadLabel(
    colorBlocks[currentBlockIndex(colorBlocks, currentStitch)] ??
      colorBlocks[0],
  );
  const blockCount = colorBlocks.length;

  switch (status) {
    case MachineStatus.MASK_TRACE_LOCK_WAIT:
      return {
        tone: "action",
        title: `Press ${ACCEPT}`,
        lines: [
          "The machine will move the frame around the edge of the design. Nothing is stitched yet.",
          "Keep hands clear of the frame.",
        ],
        needsPerson: false,
      };

    case MachineStatus.MASK_TRACING:
      return {
        tone: "progress",
        title: "Watch where the design will go",
        lines: ["The machine is tracing the edge of the design."],
        needsPerson: false,
      };

    case MachineStatus.MASK_TRACE_COMPLETE:
      return {
        tone: "action",
        title: "Happy with the position? Tap Start Sewing",
        lines: [
          `Thread the machine with ${firstThread} first.`,
          "To move the design, delete it from the machine, place it again and send it.",
        ],
        needsPerson: false,
      };

    case MachineStatus.SEWING_WAIT:
      return currentStitch > 0
        ? {
            tone: "action",
            title: `Paused. Press ${START_STOP} to carry on`,
            lines: colorBlocks.length
              ? [
                  `The machine should be threaded with ${threadLabel(colorBlocks[currentBlockIndex(colorBlocks, currentStitch)])}.`,
                ]
              : [],
            needsPerson: false,
          }
        : {
            tone: "action",
            title: `Press ${START_STOP} to begin`,
            lines: [
              `The machine should be threaded with ${firstThread}.`,
              "Not checked the position yet? Tap Trace outline first.",
            ],
            needsPerson: false,
          };

    case MachineStatus.SEWING: {
      const index = currentBlockIndex(colorBlocks, currentStitch);
      return {
        tone: "progress",
        title: colorBlocks[index]
          ? `Stitching ${threadLabel(colorBlocks[index])}`
          : "Stitching the machine’s loaded design",
        lines: [
          blockCount > 1
            ? `Thread ${index + 1} of ${blockCount}. The machine stops by itself when it is time to change thread.`
            : "The machine stops by itself when it is finished.",
        ],
        needsPerson: false,
        spool: colorBlocks[index]
          ? { lead: "Stitching", block: colorBlocks[index] }
          : undefined,
      };
    }

    case MachineStatus.COLOR_CHANGE_WAIT: {
      // The machine reports a pause after a cut exactly like a thread change.
      if (
        trimStops.length > 0 &&
        classifyMachineStop(colorBlocks, currentStitch, trimStops).kind ===
          "trim"
      ) {
        const block =
          colorBlocks[currentBlockIndex(colorBlocks, currentStitch)];
        return {
          tone: "action",
          title: `Hold the thread end, then press ${START_STOP}`,
          lines: [
            block
              ? `The thread was cut. Keep ${threadLabel(block)} in the machine: no thread change here.`
              : "The thread was cut. Keep the same thread in the machine.",
            "Hold the loose end lightly for the first few stitches so it does not pull out of the needle.",
          ],
          needsPerson: true,
        };
      }
      const index = upcomingBlockIndex(colorBlocks, currentStitch);
      return {
        tone: "action",
        title: colorBlocks[index]
          ? `Change the thread to ${threadLabel(colorBlocks[index])}`
          : "Change the thread on the machine",
        lines: [
          blockCount
            ? `Thread ${index + 1} of ${blockCount}.`
            : "Use the thread sequence for the design loaded on the machine.",
          `Then press ${START_STOP}.`,
        ],
        needsPerson: true,
        spool: colorBlocks[index]
          ? { lead: "Change the thread to", block: colorBlocks[index] }
          : undefined,
      };
    }

    case MachineStatus.PAUSE:
    case MachineStatus.SEWING_INTERRUPTION:
      return {
        tone: "action",
        title: "Stitching is paused",
        lines: [
          "Check the thread and the fabric.",
          `Tap Resume Sewing, then press ${START_STOP}.`,
        ],
        needsPerson: true,
      };

    case MachineStatus.STOP:
      return {
        tone: "problem",
        title: "The machine has stopped",
        lines: [
          `Clear whatever is wrong, then press ${ACCEPT}.`,
          "If nothing changes, turn the machine off and on again.",
        ],
        needsPerson: true,
      };

    case MachineStatus.SEWING_COMPLETE:
      return {
        tone: "done",
        title: "Finished!",
        lines: [
          "Take the frame off the machine and remove your fabric.",
          `Press ${ACCEPT}.`,
          "Tap Delete finished design to start something new.",
        ],
        needsPerson: true,
      };

    default:
      return {
        tone: "action",
        title: "Check the position: tap Trace outline",
        lines: [
          "The machine will ask you to press Accept, then move the frame around the edge of the design without stitching.",
        ],
        needsPerson: false,
      };
  }
}
