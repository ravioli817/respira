/**
 * Sounds and screen wake lock for the Stitch screen. Browsers only allow sound after the person has
 * touched the page, so the audio is prepared on the first tap anywhere.
 */
import type { NextStepTone } from "./nextStep";

const SOUND_KEY = "respira:sound";

let audio: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage unavailable: the choice lasts for this visit only
  }
}

/** Call from a tap or click so later sounds are allowed to play. */
export function primeAudio(): void {
  try {
    if (!audio) audio = new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // No audio on this device
  }
}

const TUNES: Record<"action" | "problem" | "done", number[]> = {
  action: [659, 880],
  problem: [523, 392, 523, 392],
  done: [523, 659, 784, 1047],
};

/** A short chime: two rising notes for "come and do something", lower for a problem, a flourish when done. */
export function chime(tone: NextStepTone): void {
  if (!audio || audio.state !== "running" || !soundEnabled()) return;
  const notes =
    tone === "problem" || tone === "done" ? TUNES[tone] : TUNES.action;
  const start = audio.currentTime + 0.02;
  notes.forEach((frequency, i) => {
    if (!audio) return;
    const at = start + i * 0.22;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.22);
  });
}

/** Keeps the screen from sleeping (which would drop the Bluetooth link). Returns a function that lets it sleep again. */
export function keepScreenAwake(): () => void {
  let lock: WakeLockSentinel | null = null;
  let released = false;

  const request = () => {
    if (released || !("wakeLock" in navigator)) return;
    navigator.wakeLock
      .request("screen")
      .then((sentinel) => {
        if (released) void sentinel.release();
        else lock = sentinel;
      })
      .catch(() => {
        // Refused (for example, low battery): nothing more to do
      });
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") request();
  };

  request();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    if (lock) void lock.release();
  };
}
