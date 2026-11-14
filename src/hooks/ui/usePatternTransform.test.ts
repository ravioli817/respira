import { renderHook, act, cleanup } from "@testing-library/react";
import { it, expect, vi, afterEach } from "vitest";
import { usePatternTransform } from "./usePatternTransform";
import type Konva from "konva";
import type { PesPatternData } from "../../formats/import/pesImporter";
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
it("does not move hidden canvases or intercept arrows used to edit text", () => {
  const setPatternOffset = vi.fn();
  const { result } = renderHook(() =>
    usePatternTransform({
      pesData: {} as PesPatternData,
      initialPatternOffset: { x: 0, y: 0 },
      initialPatternRotation: 0,
      setPatternOffset,
      setPatternRotation: vi.fn(),
      patternUploaded: false,
      isUploading: false,
    }),
  );
  const canvas = document.createElement("div");
  canvas.tabIndex = 0;
  document.body.append(canvas);
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  const rects = vi
    .spyOn(canvas, "getClientRects")
    .mockReturnValue([{}] as unknown as DOMRectList);
  result.current.patternGroupRef.current = {
    getStage: () => ({ container: () => canvas }),
    rotation: vi.fn(),
  } as unknown as Konva.Group;
  act(() =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    ),
  );
  expect(setPatternOffset).not.toHaveBeenCalled();
  canvas.focus();
  act(() =>
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(setPatternOffset).toHaveBeenLastCalledWith(10, 0);
  setPatternOffset.mockClear();
  rects.mockReturnValue([] as unknown as DOMRectList);
  act(() =>
    canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(setPatternOffset).not.toHaveBeenCalled();
});
