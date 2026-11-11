import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mountStudio } from "./studioApp.js";

// jsdom has no canvas. Supply a solid text mask; the real design/stitch pipeline still runs.
function canvasContext() {
  const image = (w, h) => ({
    data: new Uint8ClampedArray(w * h * 4).fill(255),
  });
  return new Proxy(
    {
      getImageData: (_x, _y, w, h) => image(w, h),
      createImageData: image,
      measureText: (text) => ({ width: text.length * 20 }),
    },
    { get: (target, key) => (key in target ? target[key] : () => {}) },
  );
}

let root, studio, onSend, fontRequests;
const button = (id) => root.querySelector(id);
const input = (id, value) => {
  button(id).value = value;
  button(id).dispatchEvent(new Event("input", { bubbles: true }));
};
const expectBlocked = () => {
  for (const id of ["#send", "#save", "#save-dst"])
    expect(button(id).disabled).toBe(true);
  button("#send").click();
  expect(onSend).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    canvasContext,
  );
  vi.stubGlobal(
    "Path2D",
    class {
      moveTo() {}
      lineTo() {}
    },
  );
  fontRequests = [];
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load: vi.fn(() => new Promise((resolve) => fontRequests.push(resolve))),
    },
  });
  root = document.createElement("div");
  document.body.appendChild(root);
  onSend = vi.fn();
  studio = mountStudio(root, { onSend });
  vi.advanceTimersByTime(60);
});
afterEach(() => {
  studio?.destroy();
  root?.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.fonts;
});

describe("Create output readiness", () => {
  it("blocks Send and both exports until the latest text and fonts are ready", async () => {
    button("#mode-text").click();
    fontRequests.shift()([]);
    await vi.advanceTimersByTimeAsync(60);
    expect(button("#send").disabled).toBe(false);

    input("#txt", "New text");
    expectBlocked();
    await vi.advanceTimersByTimeAsync(180);
    expectBlocked();
    fontRequests.shift()([]);
    await vi.advanceTimersByTimeAsync(60);
    button("#send").click();
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend.mock.calls[0][0].name).toBe("new-text");
    for (const id of ["#save", "#save-dst"])
      expect(button(id).disabled).toBe(false);
  });

  it("ignores a previous font result arriving during the next edit debounce", async () => {
    button("#mode-text").click();
    input("#txt", "Latest");
    fontRequests.shift()([]);
    await vi.advanceTimersByTimeAsync(100);
    expectBlocked();
    await vi.advanceTimersByTimeAsync(80);
    fontRequests.shift()([]);
    await vi.advanceTimersByTimeAsync(60);
    button("#send").click();
    expect(onSend.mock.calls[0][0].name).toBe("latest");
  });

  it("blocks output during stitch-setting regeneration", () => {
    input("#angle", "90");
    expectBlocked();
    vi.advanceTimersByTime(120);
    expect(button("#send").disabled).toBe(false);
  });

  it("leaves all output disabled when text becomes empty", async () => {
    button("#mode-text").click();
    fontRequests.shift()([]);
    await vi.advanceTimersByTimeAsync(60);
    input("#txt", "");
    await vi.advanceTimersByTimeAsync(240);
    expectBlocked();
  });
});
