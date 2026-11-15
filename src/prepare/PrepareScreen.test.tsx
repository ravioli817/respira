import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrepareScreen } from "./PrepareScreen";
import { usePatternStore } from "../stores/usePatternStore";
import { studioDesignToPattern } from "../studio/toPattern";
vi.mock("../components/PatternCanvas", () => ({
  PatternCanvas: () => <div>Test hoop</div>,
}));
vi.mock("../components/FileUpload", () => ({
  FileUpload: () => <div>Test PES import</div>,
}));
vi.mock("../components/HoopAlignment", () => ({ HoopAlignment: () => null }));
vi.mock("./StitchPlayback", () => ({
  StitchPlayback: () => <div>Test playback</div>,
}));
vi.mock("./DensityInspector", () => ({
  DensityInspector: () => <div>Test density</div>,
}));
const before = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
beforeEach(() => {
  usePatternStore.setState(usePatternStore.getInitialState(), true);
  const data = studioDesignToPattern({
    name: "test",
    threads: [{ index: 5, name: "red", rgb: [237, 23, 31] }],
    stitches: [
      [0, 0, 0, 0],
      [10, 0, 0, 0],
    ],
  }).data;
  usePatternStore.getState().setPattern(data, "test.pes");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("places the canvas between the short summary and collapsible options, before Continue", () => {
  render(<PrepareScreen onContinue={vi.fn()} onCreate={vi.fn()} />);
  const summary = screen.getByRole("region", { name: "Placement summary" }),
    review = screen.getByLabelText("Design review"),
    options = screen.getByRole("region", { name: "Placement options" });
  expect(before(summary, review)).toBe(true);
  expect(before(review, options)).toBe(true);
  expect(
    before(
      review,
      screen.getByRole("button", { name: "Next: send it and stitch" }),
    ),
  ).toBe(true);
  const toggle = screen.getByRole("button", { name: "Threads and options" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});
it("brings playback back into view when selected from options below the portrait canvas", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scroll,
  });
  render(<PrepareScreen onContinue={vi.fn()} onCreate={vi.fn()} />);
  expect(scroll).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Threads and options" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Watch how it will stitch" }),
  );
  expect(screen.getByText("Test playback")).toBeTruthy();
  expect(scroll).toHaveBeenCalledWith({ block: "start" });
  delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown })
    .scrollIntoView;
});
it("keeps PES import available on the empty Place screen", () => {
  act(() => usePatternStore.setState(usePatternStore.getInitialState(), true));
  render(<PrepareScreen onContinue={vi.fn()} onCreate={vi.fn()} />);
  expect(
    screen.getByText("Open an embroidery file (.pes)").closest("details")?.open,
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Threads and options" }),
  ).toBeNull();
});
