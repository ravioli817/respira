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

function enterDecorativeText() {
  // Select the legacy decorative font to exercise asynchronous browser font loading.
  button("#add-text-layer").click();
  button("#txt-font").value = "Lobster";
  button("#txt-font").dispatchEvent(new Event("change", { bubbles: true }));
  input("#txt-w", "20");
  vi.advanceTimersByTime(180);
}
describe("Create output readiness", () => {
  it("blocks Send and both exports until the latest text and fonts are ready", async () => {
    enterDecorativeText();
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
    enterDecorativeText();
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
    vi.advanceTimersByTime(180);
    expect(button("#send").disabled).toBe(false);
  });

  it("leaves all output disabled when text becomes empty", async () => {
    enterDecorativeText();
    fontRequests.shift()([]);
    await vi.advanceTimersByTimeAsync(60);
    // Hide the existing drawing: empty text alone must not suppress other layers.
    const drawing = root.querySelector("#layers button");
    drawing.click();
    button("#layer-visible").checked = false;
    button("#layer-visible").dispatchEvent(new Event("change"));
    [...root.querySelectorAll("#layers button")].at(-1).click();
    input("#txt", "");
    await vi.advanceTimersByTimeAsync(240);
    expectBlocked();
  });
});

it("adds sized shapes to the saved drawing and supports undo/redo", () => {
  const before = studio.snapshot().draw.strokes.length;
  button("#shape-kind").value = "rectangle";
  button("#shape-width").value = "30";
  button("#shape-height").value = "20";
  button("#add-shape").click();
  const saved = studio.snapshot();
  expect(saved.draw.strokes).toHaveLength(before + 1);
  const points = saved.draw.strokes.at(-1).p;
  expect(
    Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0])),
  ).toBe(30);
  expect(
    Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1])),
  ).toBe(20);
  button("#undo").click();
  expect(studio.snapshot().draw.strokes).toHaveLength(before);
  button("#redo").click();
  expect(studio.snapshot().draw.strokes).toEqual(saved.draw.strokes);
  studio.destroy();
  studio = mountStudio(root, { project: saved, onSend });
  expect(studio.snapshot().draw.strokes).toEqual(saved.draw.strokes);
});

it("rejects shapes crossing the hoop without modifying the drawing", () => {
  const before = studio.snapshot().draw.strokes;
  button("#shape-width").value = "98";
  button("#shape-style").value = "satin";
  button("#add-shape").click();
  expect(button("#shape-status").textContent).toMatch(/hoop/);
  expect(studio.snapshot().draw.strokes).toEqual(before);
});

it("combines drawing and satin text, preserving geometry through reorder, hide, undo and reopen", async () => {
  const baseline = studio.snapshot();
  button("#add-text-layer").click();
  input("#txt", "Ravi");
  input("#layer-y", "30");
  await vi.advanceTimersByTimeAsync(250);
  expect(button("#note").textContent).toBe("");
  expect(button("#send").disabled).toBe(false);
  button("#send").click();
  const mixed = onSend.mock.calls.at(-1)[0];
  expect(Math.max(...mixed.stitches.map((s) => s[1]))).toBeGreaterThan(300);
  const saved = studio.snapshot();
  expect(saved.v).toBe(3);
  expect(saved.layers.filter((l) => l.visible)).toHaveLength(2);
  expect(saved.layers.at(-1).source.font).toBe("SmallSatin");
  expect(saved.layers.at(-1).transform.y).toBe(30);
  button("#layer-earlier").click();
  expect(studio.snapshot().layers[1].id).toBe(saved.activeLayerId);
  button("#layer-undo").click();
  expect(studio.snapshot().layers.map((l) => l.id)).toEqual(
    saved.layers.map((l) => l.id),
  );
  button("#layer-visible").checked = false;
  button("#layer-visible").dispatchEvent(new Event("change"));
  await vi.advanceTimersByTimeAsync(60);
  button("#send").click();
  expect(onSend.mock.calls.at(-1)[0].stitches.length).toBeLessThan(
    mixed.stitches.length,
  );
  studio.destroy();
  studio = mountStudio(root, { project: saved, onSend });
  await vi.advanceTimersByTimeAsync(60);
  button("#send").click();
  expect(onSend.mock.calls.at(-1)[0].stitches).toEqual(mixed.stitches);
  expect(baseline.layers[0].source.strokes).toEqual(
    saved.layers[0].source.strokes,
  );
});

it("blocks output for unsupported lettering and an out-of-range final letter size", async () => {
  button("#add-text-layer").click();
  input("#txt", "Ravi 😀");
  await vi.advanceTimersByTimeAsync(250);
  expect(button("#send").disabled).toBe(true);
  expect(button("#note").textContent).toContain("😀");
  input("#txt", "Ravi");
  input("#layer-size", "200");
  await vi.advanceTimersByTimeAsync(250);
  expect(button("#send").disabled).toBe(true);
  expect(button("#note").textContent).toContain("4 and 15");
  input("#layer-size", "100");
  await vi.advanceTimersByTimeAsync(60);
  expect(button("#send").disabled).toBe(false);
});

it("does not treat a tap on text as a move or reset prepared placement", () => {
  button("#add-text-layer").click();
  studio.setPlacement({ x: 20, y: 30, rotation: 15 });
  const before = studio.snapshot();
  button("#overlay").dispatchEvent(
    new MouseEvent("pointerdown", { clientX: 50, clientY: 50, bubbles: true }),
  );
  button("#overlay").dispatchEvent(
    new MouseEvent("pointerup", { clientX: 50, clientY: 50, bubbles: true }),
  );
  expect(studio.snapshot().placement).toEqual(before.placement);
  expect(studio.snapshot().layers).toEqual(before.layers);
});

it("has one canvas toolbar and no redundant Draw/Picture/Text mode tabs", () => {
  expect(root.querySelectorAll('[role="tab"]')).toHaveLength(0);
  expect(root.querySelector('[aria-label="Canvas tools"]')).not.toBeNull();
  const before = studio.snapshot().layers.length;
  button("#add-draw-layer").click();
  expect(studio.snapshot().layers.length).toBe(before);
  button("#add-image-layer").click(); // Cancelling the picker must not create an empty object.
  expect(studio.snapshot().layers.length).toBe(before);
});

it("applies custom underlay and pull only to the selected object and preserves it across reopen", async () => {
  button("#add-text-layer").click();
  input("#txt", "Ravi");
  await vi.advanceTimersByTimeAsync(250);
  const original = studio.snapshot();
  button("#stitch-custom").checked = true;
  button("#stitch-custom").dispatchEvent(new Event("change"));
  button("#stitch-satinUnderlay").value = "center-edge";
  button("#stitch-satinUnderlay").dispatchEvent(new Event("change"));
  input("#stitch-satinPullMm", "0.4");
  await vi.advanceTimersByTimeAsync(60);
  button("#send").click();
  const encoded = onSend.mock.calls.at(-1)[0].stitches;
  const saved = studio.snapshot();
  expect(saved.layers[0].stitchSettings).toBeUndefined();
  expect(saved.layers.at(-1).stitchSettings).toMatchObject({
    satinUnderlay: "center-edge",
    satinPullMm: 0.4,
  });
  studio.destroy();
  studio = mountStudio(root, { project: saved, onSend });
  await vi.advanceTimersByTimeAsync(60);
  button("#send").click();
  expect(onSend.mock.calls.at(-1)[0].stitches).toEqual(encoded);
  expect(button("#stitch-satinPullMm").value).toBe("0.4");
  button("#stitch-custom").checked = false;
  button("#stitch-custom").dispatchEvent(new Event("change"));
  expect(studio.snapshot().layers.at(-1).stitchSettings).toBeUndefined();
  expect(studio.snapshot().layers[0].source).toEqual(original.layers[0].source);
});

it("regenerates satin lettering when the project underlay default changes", async () => {
  button("#add-text-layer").click();
  input("#txt", "Ravi");
  await vi.advanceTimersByTimeAsync(250);
  // Isolate lettering so a change in the example drawing cannot satisfy this test.
  const textOnly = studio.snapshot();
  textOnly.layers = textOnly.layers.filter(
    (l) => l.id === textOnly.activeLayerId,
  );
  studio.destroy();
  studio = mountStudio(root, { project: textOnly, onSend });
  await vi.advanceTimersByTimeAsync(60);
  button("#send").click();
  const before = onSend.mock.calls.at(-1)[0].stitches.length;
  button("#underlay").checked = false;
  button("#underlay").dispatchEvent(new Event("change"));
  await vi.advanceTimersByTimeAsync(180);
  button("#send").click();
  expect(onSend.mock.calls.at(-1)[0].stitches.length).toBeLessThan(before);
});

it("Draw does not silently include an excluded legacy drawing", () => {
  const oldId = studio.snapshot().activeLayerId;
  button("#layer-visible").checked = false;
  button("#layer-visible").dispatchEvent(new Event("change"));
  button("#add-draw-layer").click();
  const saved = studio.snapshot();
  expect(saved.layers.find((l) => l.id === oldId).visible).toBe(false);
  expect(saved.activeLayerId).not.toBe(oldId);
  expect(
    saved.layers.find((l) => l.id === saved.activeLayerId).source.strokes,
  ).toEqual([]);
});

it("keeps a burst of typing as one undo step, so earlier edits stay undoable", async () => {
  const strokes = () => studio.snapshot().layers[0].source.strokes.length;
  const before = strokes();
  const layersBefore = studio.snapshot().layers.length;
  button("#add-shape").click();
  button("#add-text-layer").click();
  // Far more keystrokes than the 40 steps the history keeps.
  let words = "";
  for (let i = 0; i < 60; i++) {
    words += "a";
    input("#txt", words.slice(0, 12));
    vi.advanceTimersByTime(100);
  }
  await vi.advanceTimersByTimeAsync(250);
  expect(studio.snapshot().layers.at(-1).source.value).toBe("aaaaaaaaaaaa");

  button("#layer-undo").click(); // the typing
  expect(studio.snapshot().layers.at(-1).source.value).toBe("Hello");
  button("#layer-undo").click(); // the text object
  expect(studio.snapshot().layers).toHaveLength(layersBefore);
  button("#layer-undo").click(); // the shape
  expect(strokes()).toBe(before);
});

it("starts a new undo step after a pause or once a control reports its final value", async () => {
  button("#add-text-layer").click();
  const value = () => studio.snapshot().layers.at(-1).source.value;
  input("#txt", "One");
  vi.advanceTimersByTime(2000);
  input("#txt", "One two");
  await vi.advanceTimersByTimeAsync(250);
  button("#layer-undo").click();
  expect(value()).toBe("One");

  // A slider drag is one step; letting go ("change") closes it.
  const y = () => studio.snapshot().layers.at(-1).transform.y;
  for (const v of ["5", "10", "15"]) input("#layer-y", v);
  button("#layer-y").dispatchEvent(new Event("change", { bubbles: true }));
  for (const v of ["20", "25"]) input("#layer-y", v);
  await vi.advanceTimersByTimeAsync(250);
  expect(y()).toBe(25);
  button("#layer-undo").click();
  expect(y()).toBe(15);
  button("#layer-undo").click();
  expect(y()).toBe(0);
});

it("Draw stays on the selected drawing, and objects of one kind get distinct names", () => {
  button("#new-drawing-object").click();
  const second = studio.snapshot().activeLayerId;
  expect(studio.snapshot().layers.at(-1).name).toBe("Drawing 2");

  button("#move-layer").click();
  button("#add-draw-layer").click();
  expect(studio.snapshot().activeLayerId).toBe(second);

  // From another kind of object, Draw goes back to the drawing last used, not the first one.
  button("#add-text-layer").click();
  expect(studio.snapshot().activeLayerId).not.toBe(second);
  button("#add-draw-layer").click();
  expect(studio.snapshot().activeLayerId).toBe(second);
});
