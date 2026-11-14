import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useMachineStore } from "../stores/useMachineStore";
import { useNextStep } from "./useNextStep";
import { stepLook, threadParts, type StepLook } from "./nextStep";
import { chime, keepScreenAwake, primeAudio, useSound } from "./attention";

/** Card colours for each look. Tape yellow and pin red keep their meaning in dark mode. */
const LOOKS: Record<StepLook, string> = {
  yours: "bg-tape text-on-tape",
  fault: "bg-pin text-white",
  machine: "bg-mat text-white",
  plain: "bg-paper text-ink border-b border-line",
};

/** How often to repeat the chime while the machine is waiting for the person. */
const REMIND_MS = 20000;

/**
 * The instruction card at the top of the Stitch screen: what to do now, in words large enough to
 * read from across the table, coloured by whose turn it is. It also chimes when the machine needs
 * someone (thread change, a fault, finished) and keeps the screen awake while connected.
 */
export function NextStepCard({ children }: { children?: ReactNode }) {
  const step = useNextStep();
  const isConnected = useMachineStore((state) => state.isConnected);
  const sound = useSound();
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

  const look = stepLook(step);
  const spool = step.spool;
  const thread = threadParts(spool?.block);

  return (
    <section
      aria-live="polite"
      aria-label="What to do now"
      data-look={look}
      className={cn(
        "flex-shrink-0 flex flex-col gap-4 px-5 sm:px-7 pt-6 pb-7",
        LOOKS[look],
      )}
    >
      {spool && thread.name ? (
        <>
          {/* The sentence for a screen reader; sighted, the thread is shown large below. */}
          <h2 className="sr-only">{step.title}</h2>
          <p aria-hidden className="text-[26px] leading-tight">
            {spool.lead}
          </p>
          <div aria-hidden className="flex items-center gap-5">
            <Spool
              color={spool.block.threadHex}
              className="size-24 sm:size-28"
            />
            <div className="min-w-0">
              <strong className="block text-[clamp(2.5rem,9vw,4.5rem)] leading-[0.95] tracking-tight break-words">
                {thread.name}
              </strong>
              {thread.catalog && (
                <span className="block mt-1 text-2xl">{thread.catalog}</span>
              )}
            </div>
          </div>
        </>
      ) : (
        <h2 className="text-[clamp(1.75rem,4.6vw,2.5rem)] font-bold leading-[1.08] tracking-tight text-balance">
          {step.title}
        </h2>
      )}
      {step.lines.length === 1 && (
        <p className="text-[22px] leading-snug">{step.lines[0]}</p>
      )}
      {step.lines.length > 1 && (
        <ol
          className={cn(
            "space-y-1.5 text-[22px] leading-snug",
            // A thread change reads as two short sentences; other steps are numbered.
            spool ? "list-none" : "list-decimal pl-7",
          )}
        >
          {step.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      )}
      {children}
    </section>
  );
}

/** A reel of thread seen end on, in the thread's colour. */
export function Spool({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 112 112"
      className={cn("flex-shrink-0", className)}
    >
      <circle
        cx="56"
        cy="56"
        r="52"
        fill={color}
        stroke="#17212b"
        strokeWidth="4"
      />
      <circle
        cx="56"
        cy="56"
        r="38"
        fill="none"
        stroke="#17212b"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeDasharray="3 5"
      />
      <circle
        cx="56"
        cy="56"
        r="24"
        fill="none"
        stroke="#17212b"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeDasharray="3 5"
      />
      <circle
        cx="56"
        cy="56"
        r="10"
        fill="#ffffff"
        stroke="#17212b"
        strokeWidth="4"
      />
    </svg>
  );
}
