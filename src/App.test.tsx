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
vi.mock("./prepare/ConnectionBar", () => ({ ConnectionBar: () => null }));
vi.mock("./components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("./components/LeftSidebar", () => ({ LeftSidebar: () => null }));
vi.mock("./components/PatternCanvas", () => ({ PatternCanvas: () => null }));
vi.mock("./components/PatternCanvasPlaceholder", () => ({
  PatternCanvasPlaceholder: () => null,
}));
vi.mock("./components/BluetoothDevicePicker", () => ({
  BluetoothDevicePicker: () => null,
}));
vi.mock("./practice/PracticePanel", () => ({ PracticePanel: () => null }));
vi.mock("./studio/ScreenTabs", () => ({
  ScreenTabs: ({ screen: active }: { screen: string }) => (
    <div data-testid="active-screen">{active}</div>
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
    expect(screen.getByTestId("studio").className).not.toContain("hidden");
    expect(screen.getByRole("alert").textContent).toBe(refusal);
  });

  it("opens Prepare after a successful handoff", () => {
    vi.mocked(loadStudioDesign).mockReturnValue(null);
    render(<App />);
    fireEvent.click(screen.getByText("Send"));
    expect(screen.getByTestId("active-screen").textContent).toBe("prepare");
  });
});
