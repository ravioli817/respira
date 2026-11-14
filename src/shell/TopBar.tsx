import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";
import { useErrorPopoverState } from "@/hooks";
import { useMachineStore } from "../stores/useMachineStore";
import { useUIStore } from "../stores/useUIStore";
import { displayName, useProjectUi } from "../projects/projectUi";
import { isBluetoothSupported } from "../utils/bluetoothSupport";
import { hasError, getErrorDetails } from "../utils/errorCodeHelpers";
import { ErrorPopoverContent } from "../components/ErrorPopover";
import { Button } from "../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";

export type Screen = "create" | "prepare" | "stitch";

/** The three steps, in the order a design goes through them. "prepare" is the Place screen. */
const STEPS: { id: Screen; label: string }[] = [
  { id: "create", label: "Create" },
  { id: "prepare", label: "Place" },
  { id: "stitch", label: "Stitch" },
];

interface TopBarProps {
  screen: Screen;
  onChange: (screen: Screen) => void;
  /** The machine is waiting for someone and the Stitch screen is not showing. */
  stitchNeedsYou?: boolean;
}

/**
 * The one bar across the top of every screen: the app's name, the open design, the three steps,
 * and the machine connection. It replaces Respira's blue header, its eight-step progress strip
 * and this fork's earlier row of tabs, which between them took a fifth of an iPad's height.
 */
export function TopBar({
  screen,
  onChange,
  stitchNeedsYou = false,
}: TopBarProps) {
  const name = useProjectUi((s) => s.name);
  const status = useProjectUi((s) => s.status);
  const openProjects = useProjectUi((s) => s.openProjects);
  const shownName = displayName(name);

  return (
    <header className="flex-shrink-0 bg-paper text-ink border-b border-line">
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-center gap-x-2 md:gap-x-4 gap-y-1.5 px-3 sm:px-5 py-1.5 sm:py-0 sm:h-16 sm:[@media(max-height:800px)]:h-14">
        <div className="flex items-center gap-3 min-w-0">
          <strong className="hidden lg:block text-xl tracking-tight whitespace-nowrap">
            Stitch Sketchbook
          </strong>
          <button
            type="button"
            onClick={openProjects}
            aria-label={`Your designs. Open now: ${shownName || "Untitled design"}`}
            className="flex items-center gap-2 h-11 px-3.5 min-w-0 rounded-[10px] border border-line-strong bg-paper hover:bg-accent cursor-pointer"
          >
            <span className="truncate">{shownName || "Untitled design"}</span>
            <ChevronDownIcon className="size-4 flex-shrink-0" aria-hidden />
          </button>
          {/* Saving happens by itself; only say so while it is in doubt. */}
          {status && status !== "Saved" && (
            <span
              role="status"
              className="hidden xl:block text-sm text-ink-soft truncate"
            >
              {status}
            </span>
          )}
        </div>

        <nav
          aria-label="Steps"
          className="flex gap-1 md:gap-1.5 max-sm:order-last max-sm:col-span-2 max-sm:justify-center"
        >
          {STEPS.map(({ id, label }, index) => {
            const active = screen === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(id)}
                className={cn(
                  "flex items-center gap-2 md:gap-2.5 h-11 pl-2 pr-3.5 md:pr-[18px] rounded-full cursor-pointer transition-colors",
                  active ? "bg-action text-white font-bold" : "hover:bg-accent",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex items-center justify-center size-7 rounded-full text-[15px] font-bold",
                    active ? "bg-white text-[#17212b]" : "bg-secondary",
                  )}
                >
                  {index + 1}
                </span>
                {label}
                {id === "stitch" && stitchNeedsYou && (
                  <span
                    role="img"
                    aria-label="The machine needs you"
                    className="size-3 rounded-full bg-tape ring-2 ring-ink animate-pulse"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-2 min-w-0">
          <ErrorBadge quiet={screen === "stitch"} />
          <Connection statusOnly={screen === "stitch"} />
        </div>
      </div>
    </header>
  );
}

/**
 * A red pill naming what is wrong, with the details behind a tap. On Stitch the instruction card
 * already explains a fault, and elsewhere a machine fault shows on the Stitch step instead of
 * opening a box over the work, so the box opens by itself only for a problem nothing else shows.
 */
function ErrorBadge({ quiet }: { quiet: boolean }) {
  const { machineError, message, isPairingError } = useMachineStore(
    useShallow((s) => ({
      machineError: s.machineError,
      message: s.error,
      isPairingError: s.isPairingError,
    })),
  );
  const pyodideError = useUIStore((s) => s.pyodideError);
  const { isOpen, handleOpenChange } = useErrorPopoverState({
    autoOpen: !quiet && !hasError(machineError),
    machineError,
    machineErrorMessage: message,
    pyodideError,
    hasError,
  });
  if (!message && !pyodideError && !hasError(machineError)) return null;
  // Some "errors" are only the machine asking for something (finding its start position after
  // being switched on). That is a step, not a fault: tape yellow, and on Stitch the card says it.
  const step =
    !message &&
    !pyodideError &&
    !!getErrorDetails(machineError)?.isInformational;
  if (step && quiet) return null;

  const text = (message || "").toLowerCase();
  const label = pyodideError
    ? "File converter"
    : isPairingError
      ? "Pairing needed"
      : text.includes("bluetooth") || text.includes("connection")
        ? "Connection problem"
        : text.includes("upload")
          ? "Sending problem"
          : machineError !== undefined
            ? getErrorDetails(machineError)?.shortName || "Machine problem"
            : "Problem";

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}. View details`}
          className={cn(
            "inline-flex items-center gap-1.5 h-11 px-3.5 min-w-0 rounded-full font-bold cursor-pointer",
            step ? "bg-tape text-on-tape" : "bg-pin text-white",
          )}
        >
          <ExclamationTriangleIcon className="size-5 flex-shrink-0" />
          <span className="truncate max-md:sr-only">{label}</span>
        </button>
      </PopoverTrigger>
      <ErrorPopoverContent
        machineError={machineError != 0xdd ? machineError : undefined}
        isPairingError={isPairingError}
        errorMessage={message}
        pyodideError={pyodideError}
      />
    </Popover>
  );
}

/** Connection status. Connected, it opens the machine's details and Disconnect. */
function Connection({ statusOnly }: { statusOnly: boolean }) {
  const { connected, machineInfo, statusName, connect, disconnect } =
    useMachineStore(
      useShallow((s) => ({
        connected: s.isConnected,
        machineInfo: s.machineInfo,
        statusName: s.machineStatusName,
        connect: s.connect,
        disconnect: s.disconnect,
      })),
    );
  const [connecting, setConnecting] = useState(false);

  if (connected) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 h-11 px-2.5 rounded-[10px] hover:bg-accent cursor-pointer whitespace-nowrap"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-ok" />
            <span className="max-lg:hidden">Skitch connected</span>
            <span className="lg:hidden">Connected</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <p className="font-bold">The machine says: {statusName}</p>
          {machineInfo?.serialNumber && (
            <p className="text-sm text-ink-soft">
              Serial number {machineInfo.serialNumber}
              {machineInfo.totalCount !== undefined && (
                <>
                  <br />
                  {machineInfo.totalCount.toLocaleString()} stitches sewn in its
                  life
                </>
              )}
            </p>
          )}
          <Button variant="outline" className="w-full" onClick={disconnect}>
            Disconnect
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  // Stitch has its own large Connect button in the instruction card.
  if (statusOnly)
    return (
      <span className="text-ink-soft whitespace-nowrap">Not connected</span>
    );

  if (!isBluetoothSupported()) {
    return (
      <span className="block max-w-[17rem] text-sm leading-snug text-right text-ink-soft">
        <span className="max-md:hidden">
          This browser can make and place designs, but cannot reach the
          machine.{" "}
        </span>
        <a
          href="https://apps.apple.com/app/id1492822055"
          target="_blank"
          rel="noreferrer"
          className="underline whitespace-nowrap"
        >
          On iPad, try Bluefy
        </a>
      </span>
    );
  }

  return (
    <Button
      variant="outline"
      className="border-line-strong"
      disabled={connecting}
      onClick={async () => {
        setConnecting(true);
        try {
          await connect();
        } finally {
          setConnecting(false);
        }
      }}
    >
      {connecting ? (
        "Connecting…"
      ) : (
        <>
          Connect<span className="max-md:hidden"> to Machine</span>
        </>
      )}
    </Button>
  );
}
