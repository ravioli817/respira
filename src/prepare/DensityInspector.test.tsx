import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DensityInspector } from "./DensityInspector";
import { studioDesignToPattern } from "../studio/toPattern";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("inspects the final bytes, filters blocks and exposes selectable cell details", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    new Proxy({}, { get: () => vi.fn() }) as CanvasRenderingContext2D,
  );
  const { data } = studioDesignToPattern({
    name: "density",
    threads: [
      { index: 5, name: "red", rgb: [237, 23, 31] },
      { index: 20, name: "black", rgb: [0, 0, 0] },
    ],
    stitches: [
      [0, 0, 0, 0],
      [20, 20, 0, 0],
      [30, 30, 0, 1],
      [40, 40, 0, 1],
    ],
  });
  render(<DensityInspector pattern={data} offset={{ x: 0, y: 0 }} />);
  const all = screen.getByRole("status").textContent;
  expect(all).toContain("needle points");
  fireEvent.change(screen.getByLabelText("Density thread blocks"), {
    target: { value: "1" },
  });
  expect(screen.getByRole("status").textContent).not.toBe(all);
  fireEvent.change(screen.getByLabelText("Density grid cell"), {
    target: { value: "1" },
  });
  fireEvent.click(screen.getByText("Highest-density cells"));
  fireEvent.click(screen.getAllByRole("button", { name: /^X / })[0]);
  expect(screen.getByText(/Selected cell:/).textContent).toContain(
    "thread blocks 2",
  );
  expect(data.penData.length).toBeGreaterThan(data.stitches.length * 4);
});
