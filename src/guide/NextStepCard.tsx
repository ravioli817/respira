import { useEffect, useRef, useState } from "react";
import {
  BellAlertIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  HandRaisedIcon,
  InformationCircleIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";
import { useMachineStore } from "../stores/useMachineStore";
import { useNextStep } from "./useNextStep";
import type { NextStepTone } from "./nextStep";
import {
  chime,
  keepScreenAwake,
  primeAudio,
  setSoundEnabled,
  soundEnabled,
} from "./attention";

const TONES: Record<
  NextStepTone,
  { card: string; icon: string; Icon: typeof BellAlertIcon }
> = {
  info: {
    card: "border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-800",
    icon: "text-gray-600 dark:text-gray-400",
    Icon: InformationCircleIcon,
  },
  action: {
    card: "border-primary-600 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/20",
    icon: "text-primary-600 dark:text-primary-400",
    Icon: HandRaisedIcon,
  },
  progress: {
    card: "border-secondary-600 dark:border-secondary-500 bg-white dark:bg-gray-800",
    icon: "text-secondary-600 dark:text-secondary-400",
    Icon: BellAlertIcon,
  },
  problem: {
    card: "border-danger-600 dark:border-danger-500 bg-danger-50 dark:bg-danger-900/20",
    icon: "text-danger-600 dark:text-danger-400",
    Icon: ExclamationTriangleIcon,
  },
  done: {
    card: "border-success-600 dark:border-success-500 bg-success-50 dark:bg-success-900/20",
    icon: "text-success-600 dark:text-success-400",
    Icon: CheckCircleIcon,
  },
};

/** How often to repeat the chime while the machine is waiting for the person. */
const REMIND_MS = 20000;

/**
 * A plain-words card saying what to do now, with a chime when the machine needs someone
 * (thread change, a fault, finished). Also keeps the screen awake while connected.
 */
export function NextStepCard() {
  const step = useNextStep();
  const isConnected = useMachineStore((state) => state.isConnected);
  const [sound, setSound] = useState(soundEnabled);
  const lastChimed = useRef("");

  // Sound is only allowed after a tap, so get ready on the first one
  useEffect(() => {
    window.addEventListener("pointerdown", primeAudio);
    return () => window.removeEventListener("pointerdown", primeAudio);
  }, []);

  // A sleeping screen drops the Bluetooth link, so stay awake while connected
  useEffect(() => {
    if (!isConnected) return;
    return keepScreenAwake();
  }, [isConnected]);

  // Chime when the machine starts needing someone, and keep reminding until they come
  const needsPerson = step?.needsPerson ?? false;
  const tone = step?.tone ?? "info";
  const title = step?.title ?? "";
  useEffect(() => {
    if (!needsPerson) {
      lastChimed.current = "";
      return;
    }
    if (lastChimed.current !== title) {
      lastChimed.current = title;
      chime(tone);
    }
    const reminder = setInterval(() => chime(tone), REMIND_MS);
    return () => clearInterval(reminder);
  }, [needsPerson, tone, title, sound]);

  if (!step) return null;

  const { card, icon, Icon } = TONES[step.tone];
  const SoundIcon = sound ? SpeakerWaveIcon : SpeakerXMarkIcon;

  return (
    <section
      aria-live="polite"
      aria-label="What to do now"
      className={cn(
        "flex-shrink-0 rounded-xl border-l-8 border-y border-r px-4 py-3 shadow-sm flex gap-3",
        card,
      )}
    >
      <Icon className={cn("w-8 h-8 flex-shrink-0 mt-0.5", icon)} />
      <div className="flex-1 min-w-0">
        <h2 className="text-lg sm:text-xl font-bold leading-snug text-gray-900 dark:text-white">
          {step.title}
        </h2>
        {step.lines.length === 1 && (
          <p className="mt-1 text-base text-gray-700 dark:text-gray-300">
            {step.lines[0]}
          </p>
        )}
        {step.lines.length > 1 && (
          <ol className="mt-1 list-decimal pl-5 space-y-0.5 text-base text-gray-700 dark:text-gray-300">
            {step.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        )}
      </div>
      <button
        type="button"
        aria-pressed={sound}
        aria-label={sound ? "Sound alerts are on" : "Sound alerts are off"}
        title={sound ? "Sound alerts are on" : "Sound alerts are off"}
        onClick={() => {
          const next = !sound;
          setSoundEnabled(next);
          setSound(next);
          if (next) {
            primeAudio();
            chime("action");
          }
        }}
        className="self-start flex-shrink-0 rounded-lg p-2 text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
      >
        <SoundIcon className="w-6 h-6" />
      </button>
    </section>
  );
}
