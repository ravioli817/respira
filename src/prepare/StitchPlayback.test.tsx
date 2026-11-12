import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { StitchPlayback } from "./StitchPlayback";
import { studioDesignToPattern } from "../studio/toPattern";

const pattern = studioDesignToPattern({
  name: "preview",
  threads: [
    { index: 5, name: "red", rgb: [237, 23, 31] },
    { index: 20, name: "black", rgb: [0, 0, 0] },
  ],
  stitches: [
    [0, 0, 0, 0],
    [10, 10, 0, 0],
    [50, 50, 16, 1],
    [60, 60, 0, 1],
  ],
}).data;
beforeEach(() => {
  vi.useFakeTimers();
  const context = new Proxy(
    {},
    { get: () => vi.fn() },
  ) as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("plays, finishes, replays and pauses at a color boundary", () => {
  render(<StitchPlayback pattern={pattern} offset={{ x: 0, y: 0 }} />);
  const slider = screen.getByRole("slider", {
    name: "Playback position",
  }) as HTMLInputElement;
  expect(slider.value).toBe("0");
  fireEvent.click(screen.getByText("Next color"));
  expect(+slider.value).toBe(
    pattern.penStitches.colorBlocks[0].endStitchIndex + 1,
  );
  fireEvent.click(screen.getByText("Play stitches"));
  act(() => vi.advanceTimersByTime(1000));
  expect(+slider.value).toBe(pattern.penData.length / 4);
  fireEvent.click(screen.getByText("Replay stitches"));
  expect(slider.value).toBe("0");
  act(() => vi.advanceTimersByTime(50));
  fireEvent.click(screen.getByText("Pause playback"));
  const paused = slider.value;
  act(() => vi.advanceTimersByTime(1000));
  expect(slider.value).toBe(paused);
});
it("resets playback when placement changes", () => {
  const { rerender } = render(
    <StitchPlayback pattern={pattern} offset={{ x: 0, y: 0 }} />,
  );
  fireEvent.click(screen.getByText("Forward 1"));
  rerender(<StitchPlayback pattern={pattern} offset={{ x: 100, y: 0 }} />);
  expect(
    (
      screen.getByRole("slider", {
        name: "Playback position",
      }) as HTMLInputElement
    ).value,
  ).toBe("0");
});
