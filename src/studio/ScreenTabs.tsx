import type { ReactNode } from "react";
import { PencilSquareIcon, PlayCircleIcon } from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";

export type Screen = "create" | "prepare" | "stitch";

interface ScreenTabsProps {
  screen: Screen;
  onChange: (screen: Screen) => void;
  /** Name of the design waiting on the Stitch screen, if any. */
  patternName?: string;
  /** Shown at the end of the row: connection status and the Connect button. */
  trailing?: ReactNode;
}

const TABS = [
  {
    id: "create",
    label: "Create",
    hint: "Draw, add a picture or text",
    Icon: PencilSquareIcon,
  },
  {
    id: "prepare",
    label: "Prepare",
    hint: "Place and preview stitches",
    Icon: PlayCircleIcon,
  },
  {
    id: "stitch",
    label: "Stitch",
    hint: "Send to the machine and watch it sew",
    Icon: PlayCircleIcon,
  },
] as const;

/** Switches between making a design and running the machine. */
export function ScreenTabs({
  screen,
  onChange,
  patternName,
  trailing,
}: ScreenTabsProps) {
  return (
    <nav
      aria-label="Screens"
      className="flex-shrink-0 flex flex-wrap items-center gap-1 sm:gap-2 px-3 sm:px-5 lg:px-6 pt-2 bg-gray-100 dark:bg-gray-900"
    >
      {TABS.map(({ id, label, hint, Icon }) => {
        const active = screen === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-1.5 text-left border-2 transition-colors min-h-[48px] cursor-pointer",
              active
                ? "bg-white dark:bg-gray-800 border-primary-600 dark:border-primary-500 shadow-sm"
                : "bg-transparent border-transparent hover:bg-white/70 dark:hover:bg-gray-800/70",
            )}
          >
            <Icon
              className={cn(
                "w-6 h-6 flex-shrink-0",
                active
                  ? "text-primary-600 dark:text-primary-400"
                  : "text-gray-500 dark:text-gray-400",
              )}
            />
            <span className="flex flex-col leading-tight">
              <span className="text-base font-semibold text-gray-900 dark:text-white">
                {label}
              </span>
              {/* The hint line needs a wide and tall window; a short one keeps the height for the hoop */}
              <span className="text-xs text-gray-600 dark:text-gray-400 hidden lg:[@media(min-height:800px)]:block">
                {id === "prepare" && patternName ? patternName : hint}
              </span>
            </span>
          </button>
        );
      })}
      {trailing && (
        <div className="ml-auto flex items-center min-h-[44px] pl-2">
          {trailing}
        </div>
      )}
    </nav>
  );
}
