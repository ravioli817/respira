import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { loadStudioDesign } from "./studio/loadStudioDesign";
import { useMachineStore } from "./stores/useMachineStore";
import { useUIStore } from "./stores/useUIStore";
import type { StudioDesign } from "./studio/studioApp.js";

vi.mock("./studio/loadStudioDesign", () => ({ loadStudioDesign: vi.fn() }));
vi.mock("./prepare/PrepareScreen", () => ({ PrepareScreen: () => null }));
vi.mock("./components/LeftSidebar", () => ({ LeftSidebar: () => null }));
vi.mock("./components/PatternCanvas", () => ({ PatternCanvas: () => null }));
vi.mock("./components/BluetoothDevicePicker", () => ({
  BluetoothDevicePicker: () => null,
}));
vi.mock("./practice/PracticePanel", () => ({ PracticePanel: () => null }));
vi.mock("./shell/TopBar", () => ({
  TopBar: ({
    screen: active,
    onChange,
  }: {
    screen: string;
    onChange: (screen: string) => void;
  }) => (
    <div>
      <div data-testid="active-screen">{active}</div>
      <button onClick={() => onChange("prepare")}>Place step</button>
    </div>
  ),
}));
vi.mock("./studio/Studio", () => ({
  Studio: ({
    onSend,
    className,
  }: {
    onSend: (design: StudioDesign) => string | null;
    className: string;
  }) => {
    const [error, setError] = useState<string | null>(null);
    return (
      <div data-testid="studio" className={className}>
        <button
          onClick={() =>
            setError(onSend({ name: "test", stitches: [], threads: [] }))
          }
        >
          Send
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  },
}));

beforeEach(() => {
  vi.stubGlobal("__APP_VERSION__", "test");
  vi.spyOn(useMachineStore.getState(), "initialize").mockImplementation(
    () => {},
  );
  vi.spyOn(useUIStore.getState(), "initializePyodide").mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Create handoff navigation", () => {
  it.each([
    "The machine already holds a design.",
    "A design is being sent to the machine right now.",
    "This design has nothing to stitch.",
  ])("keeps a refused handoff visible: %s", (refusal) => {
    vi.mocked(loadStudioDesign).mockReturnValue(refusal);
    render(<App />);
    fireEvent.click(screen.getByText("Send"));
    expect(screen.getByTestId("active-screen").textContent).toBe("create");
    expect(screen.getByTestId("studio").classList.contains("hidden")).toBe(
      false,
    );
    expect(screen.getByRole("alert").textContent).toBe(refusal);
  });

  it("opens Place after a successful handoff", () => {
    vi.mocked(loadStudioDesign).mockReturnValue(null);
    render(<App />);
    fireEvent.click(screen.getByText("Send"));
    expect(screen.getByTestId("active-screen").textContent).toBe("prepare");
  });
});

describe("The Place step in the top bar", () => {
  const sendToPlace = vi.fn();
  beforeEach(() => {
    sendToPlace.mockReset().mockReturnValue("sent");
    useProjectUi.setState({ sendToPlace });
    usePatternStore.setState(usePatternStore.getInitialState(), true);
  });

  it("carries the drawing over from Create, as the Next button does", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Place step"));
    expect(sendToPlace).toHaveBeenCalledOnce();
    // The editor's own handoff moves the screen on (or shows why it could not).
    expect(screen.getByTestId("active-screen").textContent).toBe("create");
  });

  it("opens Place as it is when there is nothing to send yet", () => {
    sendToPlace.mockReturnValue("empty");
    render(<App />);
    fireEvent.click(screen.getByText("Place step"));
    expect(screen.getByTestId("active-screen").textContent).toBe("prepare");
  });

  it("does not replace an embroidery file that was opened on Place", () => {
    const file = studioDesignToPattern({
      name: "file",
      threads: [{ index: 5, name: "red", rgb: [237, 23, 31] }],
      stitches: [
        [0, 0, 0, 0],
        [10, 0, 0, 0],
      ],
    }).data;
    usePatternStore.getState().setPattern(file, "opened.pes");
    render(<App />);
    fireEvent.click(screen.getByText("Place step"));
    expect(sendToPlace).not.toHaveBeenCalled();
    expect(screen.getByTestId("active-screen").textContent).toBe("prepare");
  });
});

import { useProjectUi } from "./projects/projectUi";

import { act } from "@testing-library/react";
import { usePatternStore } from "./stores/usePatternStore";
import { useMachineCacheStore } from "./stores/useMachineCacheStore";
import { studioDesignToPattern } from "./studio/toPattern";
it("restores the cached machine job without overwriting a different prepared draft", () => {
  const make = (x: number) =>
    studioDesignToPattern({
      name: "test",
      threads: [{ index: 5, name: "red", rgb: [237, 23, 31] }],
      stitches: [
        [x, 0, 0, 0],
        [x + 10, 0, 0, 0],
      ],
    }).data;
  const draft = make(0),
    job = make(100);
  usePatternStore.setState(usePatternStore.getInitialState(), true);
  useMachineCacheStore.getState().clearResumeState();
  usePatternStore.getState().setPattern(draft, "my-draft.pes", "project");
  render(<App />);
  act(() =>
    useMachineCacheStore.setState({
      resumedPattern: {
        pesData: job,
        uploadedPesData: job,
        patternOffset: { x: 45, y: 60 },
      },
      resumeFileName: "machine-job.pes",
    }),
  );
  expect(usePatternStore.getState().pesData).toBe(draft);
  expect(usePatternStore.getState().currentFileName).toBe("my-draft.pes");
  expect(usePatternStore.getState().uploadedPesData).toBe(job);
  expect(usePatternStore.getState().uploadedFileName).toBe("machine-job.pes");
  expect(usePatternStore.getState().uploadedPatternOffset).toEqual({
    x: 45,
    y: 60,
  });
  act(() => {
    useMachineCacheStore.getState().clearResumeState();
    usePatternStore.setState(usePatternStore.getInitialState(), true);
  });
});

it("keeps Create open when the latest edit cannot replace an older prepared snapshot", () => {
  const previous = studioDesignToPattern({
    name: "previous",
    threads: [{ index: 5, name: "red", rgb: [237, 23, 31] }],
    stitches: [
      [0, 0, 0, 0],
      [10, 0, 0, 0],
    ],
  }).data;
  usePatternStore.getState().setPattern(previous, "previous.pes", "project");
  const sendToPlace = vi.fn(() => "blocked" as const);
  useProjectUi.setState({ sendToPlace });
  render(<App />);
  fireEvent.click(screen.getByText("Place step"));
  expect(sendToPlace).toHaveBeenCalledOnce();
  expect(screen.getByTestId("active-screen").textContent).toBe("create");
  expect(usePatternStore.getState().pesData).toBe(previous);
  usePatternStore.setState(usePatternStore.getInitialState(), true);
});

it("still opens the machine's uploaded job without handing off the edited drawing", () => {
  const job = studioDesignToPattern({
    name: "job",
    threads: [{ index: 5, name: "red", rgb: [237, 23, 31] }],
    stitches: [
      [0, 0, 0, 0],
      [10, 0, 0, 0],
    ],
  }).data;
  usePatternStore.getState().setUploadedPattern(job, { x: 0, y: 0 }, "job.pes");
  const sendToPlace = vi.fn(() => "blocked" as const);
  useProjectUi.setState({ sendToPlace });
  render(<App />);
  fireEvent.click(screen.getByText("Place step"));
  expect(sendToPlace).not.toHaveBeenCalled();
  expect(screen.getByTestId("active-screen").textContent).toBe("prepare");
  usePatternStore.setState(usePatternStore.getInitialState(), true);
});

it("keeps initial pending or invalid artwork on Create even without an older snapshot", () => {
  usePatternStore.setState(usePatternStore.getInitialState(), true);
  useProjectUi.setState({ sendToPlace: () => "blocked" });
  render(<App />);
  fireEvent.click(screen.getByText("Place step"));
  expect(screen.getByTestId("active-screen").textContent).toBe("create");
});
it("does not expose the previous snapshot after all artwork is cleared", () => {
  const previous = studioDesignToPattern({
    name: "old",
    threads: [{ index: 5, name: "red", rgb: [237, 23, 31] }],
    stitches: [
      [0, 0, 0, 0],
      [10, 0, 0, 0],
    ],
  }).data;
  usePatternStore.getState().setPattern(previous, "old.pes", "project");
  useProjectUi.setState({ sendToPlace: () => "empty" });
  render(<App />);
  fireEvent.click(screen.getByText("Place step"));
  expect(screen.getByTestId("active-screen").textContent).toBe("prepare");
  expect(usePatternStore.getState().pesData).toBeNull();
  usePatternStore.setState(usePatternStore.getInitialState(), true);
});
