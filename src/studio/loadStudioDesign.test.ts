import { afterEach, expect, it } from "vitest";
import { loadStudioDesign } from "./loadStudioDesign";
import { usePatternStore } from "../stores/usePatternStore";
import { useMachineStore } from "../stores/useMachineStore";

const initial = usePatternStore.getState();
afterEach(() => usePatternStore.setState(initial));
it("restores saved placement and associates only studio patterns with their project", () => {
  useMachineStore.setState({ patternInfo: null });
  expect(
    loadStudioDesign({
      name: "placed",
      projectId: "project-one",
      placement: { x: 150, y: -100, rotation: 45 },
      threads: [{ index: 5, name: "red", rgb: [237, 23, 31] }],
      stitches: [
        [0, 0, 0, 0],
        [20, 20, 0, 0],
      ],
    }),
  ).toBeNull();
  const pattern = usePatternStore.getState();
  expect(pattern.sourceProjectId).toBe("project-one");
  expect(pattern.patternOffset).toEqual({ x: 150, y: -100 });
  expect(pattern.patternRotation).toBe(45);
  pattern.setPattern(pattern.pesData!, "external.pes");
  expect(usePatternStore.getState().sourceProjectId).toBeNull();
});
