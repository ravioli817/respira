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
    const drawing = root.querySelector("#layers .layer-pick");
    drawing.click();
    button("#layer-visible").checked = false;
    button("#layer-visible").dispatchEvent(new Event("change"));
    [...root.querySelectorAll("#layers .layer-pick")].at(-1).click();
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
  expect(saved.v).toBe(6);
  expect(saved.layers.filter((l) => l.visible)).toHaveLength(2);
  expect(saved.layers.at(-1).source.font).toBe("SmallSatin");
  expect(saved.layers.at(-1).transform.y).toBe(30);
  button("#layer-earlier").click();
  expect(studio.snapshot().layers[1].id).toBe(saved.activeLayerId);
  button("#undo").click();
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

it("has one rail of tools and no redundant Draw/Picture/Text mode tabs", () => {
  expect(root.querySelectorAll('[role="tab"]')).toHaveLength(0);
  expect(root.querySelectorAll('nav[aria-label="Tools"]')).toHaveLength(1);
  // The drawing tools are the way into drawing: there is no separate Draw button.
  expect(root.querySelector("#add-draw-layer")).toBeNull();
  expect(button("#add-text-layer").textContent.trim()).toBe("Text");
  // The parts list has its own button in the rail, and a part's name, size and position are in
  // plain view: neither sits inside a folded "More".
  expect(button("#toggle-objects").closest("nav")).not.toBeNull();
  expect(button("#layer-name").closest("details")).toBeNull();
  expect(button("#fname").closest("details")).toBeNull();
  const before = studio.snapshot().layers.length;
  button("#tool-satin").click();
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
  button("#tool-satin").click();
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

  button("#undo").click(); // the typing
  expect(studio.snapshot().layers.at(-1).source.value).toBe("Bharti");
  button("#undo").click(); // the text object
  expect(studio.snapshot().layers).toHaveLength(layersBefore);
  button("#undo").click(); // the shape
  expect(strokes()).toBe(before);
});

it("starts a new undo step after a pause or once a control reports its final value", async () => {
  button("#add-text-layer").click();
  const value = () => studio.snapshot().layers.at(-1).source.value;
  input("#txt", "One");
  vi.advanceTimersByTime(2000);
  input("#txt", "One two");
  await vi.advanceTimersByTimeAsync(250);
  button("#undo").click();
  expect(value()).toBe("One");

  // A slider drag is one step; letting go ("change") closes it.
  const y = () => studio.snapshot().layers.at(-1).transform.y;
  for (const v of ["5", "10", "15"]) input("#layer-y", v);
  button("#layer-y").dispatchEvent(new Event("change", { bubbles: true }));
  for (const v of ["20", "25"]) input("#layer-y", v);
  await vi.advanceTimersByTimeAsync(250);
  expect(y()).toBe(25);
  button("#undo").click();
  expect(y()).toBe(15);
  button("#undo").click();
  expect(y()).toBe(0);
});

it("Draw stays on the selected drawing, and objects of one kind get distinct names", () => {
  button("#new-drawing-object").click();
  const second = studio.snapshot().activeLayerId;
  expect(studio.snapshot().layers.at(-1).name).toBe("Drawing 2");

  button("#move-layer").click();
  button("#tool-satin").click();
  expect(studio.snapshot().activeLayerId).toBe(second);

  // From another kind of object, Draw goes back to the drawing last used, not the first one.
  button("#add-text-layer").click();
  expect(studio.snapshot().activeLayerId).not.toBe(second);
  button("#tool-satin").click();
  expect(studio.snapshot().activeLayerId).toBe(second);
});

it("recolors only the selected drawing, supports one-step undo/redo and survives reopening", async () => {
  const original = studio.snapshot().layers[0];
  button("#layer-duplicate").click();
  const copyId = studio.snapshot().activeLayerId;
  root.querySelector('#draw-palette-bench [aria-label="Blue"]').click();
  button("#recolor-drawing").click();
  await vi.advanceTimersByTimeAsync(60);
  const saved = studio.snapshot(),
    copy = saved.layers.find((l) => l.id === copyId);
  expect(copy.source.strokes.every((s) => s.c === 2)).toBe(true);
  expect(
    copy.source.labels
      .filter((_, i) => i % 2 === 0)
      .every((c) => c === 0 || c === 2),
  ).toBe(true);
  expect(saved.layers[0].source).toEqual(original.source);
  button("#undo").click();
  expect(
    studio
      .snapshot()
      .layers.find((l) => l.id === copyId)
      .source.strokes.map((s) => s.c),
  ).toEqual(original.source.strokes.map((s) => s.c));
  button("#redo").click();
  expect(
    studio.snapshot().layers.find((l) => l.id === copyId).source.strokes,
  ).toEqual(copy.source.strokes);
  studio.destroy();
  studio = mountStudio(root, { project: saved, onSend });
  await vi.advanceTimersByTimeAsync(60);
  expect(studio.snapshot().layers.find((l) => l.id === copyId).source).toEqual(
    copy.source,
  );
  expect(button("#send").disabled).toBe(false);
});

it("shows a non-blocking named picture warning and clears it when the picture is enlarged", async () => {
  vi.stubGlobal(
    "Image",
    class {
      width = 500;
      height = 20;
      set src(value) {
        this.url = value;
        Promise.resolve().then(() => this.onload?.());
      }
    },
  );
  const project = studio.snapshot();
  project.mode = "image";
  project.activeLayerId = "thin";
  project.layers = [
    {
      id: "thin",
      name: "Fine logo",
      kind: "image",
      visible: true,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      source: {
        sizeMM: 20,
        k: 1,
        removeBg: false,
        clean: 1,
        fileName: "thin.png",
        sourceDataURL: "data:image/png;base64,AAAA",
        clusters: [],
      },
    },
  ];
  studio.destroy();
  studio = mountStudio(root, { project, onSend });
  await vi.advanceTimersByTimeAsync(100);
  expect(button("#note").textContent).toContain("Fine logo");
  expect(button("#send").disabled).toBe(false);
  input("#layer-size", "200");
  await vi.advanceTimersByTimeAsync(60);
  expect(button("#note").textContent).not.toContain("Fine logo");
  expect(button("#send").disabled).toBe(false);
});

it("opens a drawing ready to draw, exposes only the selected object's properties and uses Bharti for new text", () => {
  // The project opens on its drawing with a drawing tool on, so the Pencil draws straight away.
  expect(button("#tool-satin").getAttribute("aria-pressed")).toBe("true");
  expect(button("#move-layer").getAttribute("aria-pressed")).toBe("false");
  expect(button("#selection-box").hidden).toBe(true);
  button("#add-text-layer").click();
  expect(button("#move-layer").getAttribute("aria-pressed")).toBe("true");
  // With words selected no drawing tool is on; the tools stay in reach in the rail.
  expect(root.querySelectorAll('.tool[aria-pressed="true"]')).toHaveLength(0);
  expect(button("#txt").value).toBe("Bharti");
  expect(button("#panel-text").hidden).toBe(false);
  expect(button("#panel-draw").hidden).toBe(true);
  button("#tool-satin").click();
  expect(button("#selection-box").hidden).toBe(true);
  button("#move-layer").click();
  expect(button("#selection-box").hidden).toBe(false);
  expect(button("#panel-text").hidden).toBe(true);
  expect(button("#panel-draw").hidden).toBe(false);
});

it("collapses portrait panels independently and docks the thread panel again on rotation", () => {
  studio.destroy();
  const media = new EventTarget();
  media.matches = true;
  vi.stubGlobal("matchMedia", () => media);
  studio = mountStudio(root, { onSend });
  expect(button("#objects-panel").hidden).toBe(true);
  expect(button("#properties-panel").hidden).toBe(true);
  button("#toggle-objects").click();
  expect(button("#objects-panel").hidden).toBe(false);
  button("#toggle-properties").click();
  expect(button("#objects-panel").hidden).toBe(true);
  expect(button("#properties-panel").hidden).toBe(false);
  button("#close-properties").click();
  expect(button("#toggle-properties").getAttribute("aria-expanded")).toBe(
    "false",
  );
  expect(document.activeElement).toBe(button("#toggle-properties"));
  const event = new Event("change");
  Object.assign(event, { matches: false });
  media.dispatchEvent(event);
  // The parts list stays shut until it is asked for (it lives behind "More").
  expect(button("#objects-panel").hidden).toBe(true);
  expect(button("#properties-panel").hidden).toBe(false);
  button("#toggle-objects").click();
  expect(button("#objects-panel").hidden).toBe(false);
  expect(button("#properties-panel").hidden).toBe(false);
});

it("inserts a toolbar shape as a separate editable object with one undo step", () => {
  const before = studio.snapshot();
  button("#shape-tool").click();
  button("#shape-kind").value = "rectangle";
  button("#add-shape").click();
  const after = studio.snapshot();
  expect(after.layers.length).toBe(before.layers.length + 1);
  expect(after.layers.at(-1).source.strokes).toHaveLength(1);
  expect(after.layers[0].source).toEqual(before.layers[0].source);
  expect(button("#move-layer").getAttribute("aria-pressed")).toBe("true");
  button("#undo").click();
  expect(studio.snapshot().layers).toEqual(before.layers);
});

it("updates rotated dimensions, regenerates resized output and keeps the edit through reopen", async () => {
  button("#shape-tool").click();
  button("#shape-kind").value = "rectangle";
  button("#shape-width").value = "30";
  button("#shape-height").value = "20";
  button("#add-shape").click();
  input("#layer-rotation", "90");
  await vi.advanceTimersByTimeAsync(70);
  expect(+button("#object-width").value).toBeCloseTo(20);
  expect(+button("#object-height").value).toBeCloseTo(30);
  const before = studio.snapshot();
  button("#object-width").value = "24";
  button("#object-width").dispatchEvent(new Event("change", { bubbles: true }));
  expectBlocked();
  await vi.advanceTimersByTimeAsync(70);
  expect(+button("#object-height").value).toBeCloseTo(36);
  expect(studio.snapshot().layers.at(-1).transform.scale).toBeCloseTo(1.2);
  button("#send").click();
  const output = onSend.mock.calls.at(-1)[0];
  const saved = studio.snapshot();
  button("#undo").click();
  expect(studio.snapshot().layers).toEqual(before.layers);
  button("#redo").click();
  studio.destroy();
  studio = mountStudio(root, { project: saved, onSend });
  await vi.advanceTimersByTimeAsync(70);
  button("#send").click();
  expect(onSend.mock.calls.at(-1)[0].stitches).toEqual(output.stitches);
});

it("groups corner drag resizing into one undo step and ignores a second pointer", async () => {
  button("#shape-tool").click();
  button("#shape-kind").value = "rectangle";
  button("#shape-width").value = "30";
  button("#shape-height").value = "20";
  button("#add-shape").click();
  await vi.advanceTimersByTimeAsync(70);
  const before = studio.snapshot();
  vi.spyOn(button("#overlay"), "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  });
  const pointer = (target, type, x, y, id = 1) => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(e, "pointerId", { value: id });
    target.dispatchEvent(e);
  };
  pointer(root.querySelector('[data-corner="se"]'), "pointerdown", 65, 60);
  pointer(button("#overlay"), "pointermove", 95, 80, 2);
  expect(studio.snapshot().layers).toEqual(before.layers);
  pointer(button("#overlay"), "pointermove", 68, 62);
  pointer(button("#overlay"), "pointermove", 71, 64);
  pointer(button("#overlay"), "pointerup", 71, 64);
  expect(studio.snapshot().layers.at(-1).transform.scale).toBeCloseTo(1.2);
  button("#undo").click();
  expect(studio.snapshot().layers).toEqual(before.layers);
});

it("keeps zoom, pan and panel changes out of artwork history and prepared placement", () => {
  studio.setPlacement({ x: 10, y: 20, rotation: 15 });
  const before = studio.snapshot();
  input("#canvas-zoom", "200");
  button("#pan-canvas").click();
  const event = (type, x, y) =>
    button("#overlay").dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }),
    );
  event("pointerdown", 20, 20);
  event("pointermove", 40, 40);
  event("pointerup", 40, 40);
  button("#grid-toggle").click();
  button("#toggle-properties").click();
  expect(studio.snapshot()).toEqual(before);
  expect(button("#undo").disabled).toBe(true);
  expect(button("#selection-box").hidden).toBe(true);
  button("#move-layer").click();
  expect(button("#pan-canvas").getAttribute("aria-pressed")).toBe("false");
  button("#size-fit").click();
  expect(button("#canvas-zoom").value).toBe("100");
});

it("draws straight away on a drawing, moves objects only in Select, and returns to drawing", async () => {
  const before = studio.snapshot().draw.strokes.length;
  vi.spyOn(button("#overlay"), "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  });
  const event = (type, x, y) =>
    button("#overlay").dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }),
    );
  // No tool tapped yet: the first stroke already draws.
  event("pointerdown", 5, 5);
  event("pointermove", 15, 15);
  event("pointerup", 15, 15);
  await vi.advanceTimersByTimeAsync(70);
  expect(studio.snapshot().draw.strokes.length).toBe(before + 1);
  // In Select a stroke over empty hoop draws nothing (and moves nothing).
  button("#move-layer").click();
  expect(button("#selection-box").hidden).toBe(false);
  event("pointerdown", 92, 4);
  event("pointermove", 97, 9);
  event("pointerup", 97, 9);
  await vi.advanceTimersByTimeAsync(70);
  expect(studio.snapshot().draw.strokes.length).toBe(before + 1);
  button("#tool-satin").click();
  event("pointerdown", 5, 5);
  event("pointermove", 15, 15);
  event("pointerup", 15, 15);
  await vi.advanceTimersByTimeAsync(70);
  expect(studio.snapshot().draw.strokes.length).toBe(before + 2);
  button("#undo").click();
  button("#undo").click();
  expect(studio.snapshot().draw.strokes.length).toBe(before);
});

it("does not create an empty drawing when opening or cancelling Shape from a text-only project", () => {
  button("#add-text-layer").click();
  const saved = studio.snapshot();
  saved.layers = saved.layers.filter((l) => l.id === saved.activeLayerId);
  studio.destroy();
  studio = mountStudio(root, { project: saved, onSend });
  const before = studio.snapshot();
  button("#shape-tool").click();
  expect(studio.snapshot().layers).toEqual(before.layers);
  button("#cancel-shape").click();
  expect(studio.snapshot().layers).toEqual(before.layers);
  button("#shape-tool").click();
  button("#add-shape").click();
  expect(studio.snapshot().layers).toHaveLength(2);
  expect(studio.snapshot().layers.at(-1).source.strokes).toHaveLength(1);
});

it("keeps Real size real in a window too small for it, and offers Pan instead of shrinking the hoop", () => {
  const viewport = button("#canvas-viewport");
  const size = (px) => {
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      value: px,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: px,
    });
  };
  const hoopWidth = () => parseFloat(button(".hoop").style.width);

  // New projects start at real size.
  expect(button("#size-real").getAttribute("aria-pressed")).toBe("true");
  size(2000);
  button("#size-real").click();
  const real = hoopWidth();
  expect(button("#pan-canvas").hidden).toBe(true);

  size(400);
  button("#size-real").click();
  expect(hoopWidth()).toBe(real);
  expect(button("#pan-canvas").hidden).toBe(false);
  expect(button("#size-note").textContent).toMatch(/Pan/);

  button("#size-fit").click();
  expect(hoopWidth()).toBeLessThan(400);
  expect(button("#pan-canvas").hidden).toBe(true);
});

it("docks the drawing tools above the hoop on a narrow screen instead of opening a drawer over it", () => {
  studio.destroy();
  const media = new EventTarget();
  media.matches = true;
  vi.stubGlobal("matchMedia", () => media);
  studio = mountStudio(root, { onSend });
  const dock = button("#draw-dock");

  // Opens on the drawing, ready to draw: tools and thread colors are in the dock, no drawer is open.
  expect(dock.hidden).toBe(false);
  expect(dock.contains(button("#toolbar"))).toBe(true);
  expect(dock.contains(button("#draw-palette-bench"))).toBe(true);
  expect(button("#properties-panel").hidden).toBe(true);

  // Select hands them back to Properties.
  button("#move-layer").click();
  expect(dock.hidden).toBe(true);
  expect(button("#panel-draw").contains(button("#toolbar"))).toBe(true);

  // Draw again: docked, and Properties stays shut.
  button("#tool-satin").click();
  expect(dock.hidden).toBe(false);
  expect(button("#properties-panel").hidden).toBe(true);

  // Picking a tool from the open drawer starts drawing and gets the drawer off the hoop.
  button("#move-layer").click();
  button("#toggle-properties").click();
  expect(button("#properties-panel").hidden).toBe(false);
  button("#tool-line").click();
  expect(button("#properties-panel").hidden).toBe(true);
  expect(dock.contains(button("#toolbar"))).toBe(true);

  // Rotating to the wide layout puts the tools back beside the canvas.
  const event = new Event("change");
  Object.assign(event, { matches: false });
  media.dispatchEvent(event);
  expect(dock.hidden).toBe(true);
  expect(button("#panel-draw").contains(button("#toolbar"))).toBe(true);
});

it("tells the host the design's name, names threads by their number, and sends when the host asks", () => {
  studio.destroy();
  const onName = vi.fn();
  const threadCode = vi.fn(() => "Brother 509");
  studio = mountStudio(root, { onSend, onName, threadCode });
  vi.advanceTimersByTime(60);
  input("#fname", "flower");
  expect(onName).toHaveBeenLastCalledWith("flower");
  // The thread in hand is named as its spool is, not by its place in a list.
  expect(root.querySelector(".thread-name").textContent).toBe("Leaf Green");
  expect(root.querySelector(".thread-code").textContent).toBe("Brother 509");
  // The top bar's Place step uses send(): the Next button without the tap.
  expect(studio.send()).toBe("sent");
  expect(onSend).toHaveBeenCalledOnce();
});

it("starts drawing from a picture or words by tapping a drawing tool", () => {
  button("#add-text-layer").click();
  const words = studio.snapshot().activeLayerId;
  button("#tool-line").click();
  const saved = studio.snapshot();
  expect(saved.activeLayerId).not.toBe(words);
  expect(saved.layers.find((l) => l.id === saved.activeLayerId).kind).toBe(
    "draw",
  );
  expect(button("#tool-line").getAttribute("aria-pressed")).toBe("true");
  expect(button("#move-layer").getAttribute("aria-pressed")).toBe("false");
});

it("saves both new embroidery fonts and trim rules through undo, duplication and v4 reopening", async () => {
  button("#add-text-layer").click();
  for (const font of ["RoundedSatin", "ScriptSatin"]) {
    button("#txt-font").value = font;
    button("#txt-font").dispatchEvent(new Event("change", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    expect(button("#send").disabled).toBe(false);
    expect(button("#font-note").textContent).toContain(
      font === "RoundedSatin" ? "10–19" : "14.5–24.5",
    );
    expect(button("#fill-stitch-fields").hidden).toBe(true);
    expect(button("#satin-stitch-fields").hidden).toBe(false);
  }
  input("#txt", "AB CD");
  button("#txt-trim").value = "letter";
  button("#txt-trim").dispatchEvent(new Event("change", { bubbles: true }));
  expectBlocked();
  await vi.advanceTimersByTimeAsync(250);
  button("#send").click();
  const output = onSend.mock.calls.at(-1)[0];
  expect(output.stitches.filter((s) => (s[2] & 0x30) === 0x30)).toHaveLength(3);
  button("#undo").click();
  expect(button("#txt-trim").value).toBe("auto");
  button("#redo").click();
  expect(button("#txt-trim").value).toBe("letter");
  button("#layer-duplicate").click();
  expect(studio.snapshot().layers.at(-1).source.trimRule).toBe("letter");
  button("#undo").click();
  const saved = studio.snapshot();
  expect(saved.v).toBe(6);
  studio.destroy();
  studio = mountStudio(root, { project: saved, onSend });
  await vi.advanceTimersByTimeAsync(70);
  button("#send").click();
  expect(button("#txt-font").value).toBe("ScriptSatin");
  expect(button("#txt-trim").value).toBe("letter");
  expect(onSend.mock.calls.at(-1)[0].stitches).toEqual(output.stitches);
  input("#layer-size", "200");
  await vi.advanceTimersByTimeAsync(70);
  expect(button("#send").disabled).toBe(true);
  expect(button("#note").textContent).toContain("14.5 and 24.5");
  button("#undo").click();
  await vi.advanceTimersByTimeAsync(70);
  button("#txt-font").value = "Lobster";
  button("#txt-font").dispatchEvent(new Event("change"));
  expect(button("#lettering-trims").hidden).toBe(true);
});

it("keeps a decoding picture through undo/redo and lets the latest replacement win", async () => {
  const decodes = [];
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(() => new Promise((resolve) => decodes.push(resolve))),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,cGljdHVyZQ==",
  );
  const choose = (id, name) => {
    Object.defineProperty(button(id), "files", {
      configurable: true,
      value: [new File(["x"], name)],
    });
    button(id).dispatchEvent(new Event("change", { bubbles: true }));
  };
  choose("#add-picture-file", "first.png");
  button("#undo").click();
  button("#redo").click();
  decodes[0]({ width: 64, height: 64, close: vi.fn() });
  await vi.advanceTimersByTimeAsync(70);
  expect(studio.snapshot().layers.at(-1).source.fileName).toBe("first.png");
  choose("#file", "older.png");
  choose("#file", "latest.png");
  decodes[2]({ width: 64, height: 64, close: vi.fn() });
  await vi.advanceTimersByTimeAsync(70);
  decodes[1]({ width: 64, height: 64, close: vi.fn() });
  await vi.advanceTimersByTimeAsync(70);
  expect(studio.snapshot().layers.at(-1).source.fileName).toBe("latest.png");
  button("#undo").click();
  await vi.advanceTimersByTimeAsync(70);
  expect(studio.snapshot().layers.at(-1).source.fileName).toBe("older.png");
  root.querySelector('#img-clean [data-clean="3"]').click();
  await vi.advanceTimersByTimeAsync(150);
  expect(studio.snapshot().layers.at(-1).source.clean).toBe(3);
  button("#undo").click();
  expect(studio.snapshot().layers.at(-1).source.clean).toBe(2);
});

it("keeps the prior picture intact when a replacement cannot be processed", async () => {
  let finish;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,cGljdHVyZQ==",
  );
  const choose = (id, name) => {
    Object.defineProperty(button(id), "files", {
      configurable: true,
      value: [new File(["x"], name)],
    });
    button(id).dispatchEvent(new Event("change"));
  };
  choose("#add-picture-file", "good.png");
  finish({ width: 64, height: 64, close: vi.fn() });
  await vi.advanceTimersByTimeAsync(70);
  choose("#file", "bad.png");
  const getContext = HTMLCanvasElement.prototype.getContext;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (...args) {
      const context = getContext.apply(this, args);
      context.getImageData = () => {
        throw new Error("Cannot read pixels");
      };
      return context;
    },
  );
  finish({ width: 64, height: 64, close: vi.fn() });
  await vi.advanceTimersByTimeAsync(70);
  expect(studio.snapshot().layers.at(-1).source.fileName).toBe("good.png");
  expect(button("#toast").textContent).toMatch(/couldn't be opened/);
});

it("refuses the top-bar handoff during generation and invalid lettering, then sends the corrected design", async () => {
  button("#add-text-layer").click();
  input("#txt", "Bharti updated");
  expect(studio.send()).toBe("blocked");
  expect(onSend).not.toHaveBeenCalled();
  expect(button("#save-status").textContent).toMatch(/not ready to place/);
  await vi.advanceTimersByTimeAsync(250);
  expect(button("#save-status").textContent).toBe("");
  expect(studio.send()).toBe("sent");
  expect(onSend).toHaveBeenCalledOnce();
  onSend.mockClear();
  input("#txt", "Bharti 😀");
  await vi.advanceTimersByTimeAsync(250);
  expect(studio.send()).toBe("blocked");
  expect(onSend).not.toHaveBeenCalled();
  expect(button("#save-status").textContent).toContain("😀");
  input("#txt", "Bharti");
  await vi.advanceTimersByTimeAsync(250);
  expect(button("#save-status").textContent).toBe("");
  expect(studio.send()).toBe("sent");
  expect(onSend).toHaveBeenCalledOnce();
});
it("distinguishes genuinely empty artwork from a blocked generation", async () => {
  button("#clear").click();
  button("#clear").click();
  await vi.advanceTimersByTimeAsync(70);
  expect(studio.send()).toBe("empty");
  expect(onSend).not.toHaveBeenCalled();
});

import { StitchEngine as E } from "./engine.js";

it("keeps turn, copy and delete beside the hoop in Move, and gives every layer a picture and an eye", () => {
  // While drawing, the layer actions stay out of the way.
  expect(button("#part-actions").hidden).toBe(true);
  button("#move-layer").click();
  expect(button("#part-actions").hidden).toBe(false);
  const id = studio.snapshot().activeLayerId;
  const rotation = () =>
    studio.snapshot().layers.find((l) => l.id === id).transform.rotation;
  button("#part-turn-right").click();
  button("#part-turn-right").click();
  expect(rotation()).toBe(30);
  // A run of taps is one step back.
  button("#undo").click();
  expect(rotation()).toBe(0);
  button("#part-turn-left").click();
  expect(rotation()).toBe(-15);

  const count = studio.snapshot().layers.length;
  button("#part-duplicate").click();
  expect(studio.snapshot().layers).toHaveLength(count + 1);
  button("#part-remove").click();
  expect(studio.snapshot().layers).toHaveLength(count);

  const rows = [...root.querySelectorAll("#layers .layer-row")];
  expect(rows).toHaveLength(count);
  expect(rows.every((row) => row.querySelector("canvas"))).toBe(true);
  const eye = rows[0].querySelector(".layer-eye");
  expect(eye.getAttribute("aria-pressed")).toBe("true");
  eye.click();
  expect(studio.snapshot().layers[0].visible).toBe(false);
  expect(
    root.querySelector("#layers .layer-row").classList.contains("off"),
  ).toBe(true);
  button("#undo").click();
  expect(studio.snapshot().layers[0].visible).toBe(true);
});

it("merges two drawings into one where they sit, and undo brings both back", async () => {
  const first = studio.snapshot().layers[0];
  button("#new-drawing-object").click();
  button("#layer-earlier").click(); // Adjacent to the first drawing, before the excluded legacy text.

  vi.spyOn(button("#overlay"), "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  });
  const event = (type, x, y) =>
    button("#overlay").dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }),
    );
  event("pointerdown", 10, 10);
  event("pointermove", 20, 10);
  event("pointerup", 20, 10);
  await vi.advanceTimersByTimeAsync(70);
  const snap = studio.snapshot();
  const second = snap.layers.find((l) => l.id === snap.activeLayerId);
  expect(second.source.strokes).toHaveLength(1);
  // Move the new drawing 10 mm across, so merging has a placement to keep.
  input("#layer-x", "10");
  await vi.advanceTimersByTimeAsync(70);

  expect(button("#layer-merge").hidden).toBe(false);
  expect(button("#layer-merge").textContent).toContain(first.name);
  button("#layer-merge").click();
  await vi.advanceTimersByTimeAsync(70);
  const drawings = studio.snapshot().layers.filter((l) => l.kind === "draw");
  expect(drawings).toHaveLength(1);
  expect(drawings[0].id).toBe(first.id);
  expect(drawings[0].transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
  expect(drawings[0].source.strokes).toHaveLength(
    first.source.strokes.length + 1,
  );
  // The moved mark stays where it was on the hoop: 10 mm further across than it was drawn.
  expect(drawings[0].source.strokes.at(-1).p[0][0]).toBeCloseTo(
    second.source.strokes[0].p[0][0] + 10,
    5,
  );
  expect(button("#send").disabled).toBe(false);

  button("#undo").click();
  expect(
    studio.snapshot().layers.filter((l) => l.kind === "draw"),
  ).toHaveLength(2);
  // A picture or text has nothing to merge with.
  button("#add-text-layer").click();
  expect(button("#layer-merge").hidden).toBe(true);
});

it("crops a picture as one undoable step, and shows one swatch for each thread", async () => {
  let decode;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(() => new Promise((resolve) => (decode = resolve))),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,cGljdHVyZQ==",
  );
  expect(button("#img-crop").disabled).toBe(true);
  Object.defineProperty(button("#add-picture-file"), "files", {
    configurable: true,
    value: [new File(["x"], "photo.png")],
  });
  button("#add-picture-file").dispatchEvent(new Event("change"));
  decode({ width: 200, height: 100, close: vi.fn() });
  await vi.advanceTimersByTimeAsync(70);
  const source = () => studio.snapshot().layers.at(-1).source;
  expect(source().crop).toBeUndefined();
  expect(button("#img-crop").disabled).toBe(false);

  button("#img-crop").click();
  expect(button("#cropper").hidden).toBe(false);
  vi.spyOn(button("#crop-stage"), "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 200,
  });
  const corner = root.querySelector(".crop-handle.se");
  corner.dispatchEvent(
    new MouseEvent("pointerdown", {
      clientX: 400,
      clientY: 200,
      bubbles: true,
    }),
  );
  button("#crop-box").dispatchEvent(
    new MouseEvent("pointermove", {
      clientX: 300,
      clientY: 100,
      bubbles: true,
    }),
  );
  button("#crop-box").dispatchEvent(
    new MouseEvent("pointerup", { clientX: 300, clientY: 100, bubbles: true }),
  );
  // The layer itself must not have been resized by dragging a crop corner.
  expect(studio.snapshot().layers.at(-1).transform.scale).toBe(1);
  button("#crop-apply").click();
  await vi.advanceTimersByTimeAsync(150);
  expect(button("#cropper").hidden).toBe(true);
  expect(source().crop).toEqual({ x: 0, y: 0, w: 0.75, h: 0.5 });
  button("#undo").click();
  await vi.advanceTimersByTimeAsync(150);
  expect(source().crop).toBeUndefined();

  // One way of matching threads: there is no switch between two.
  expect(root.querySelector("#img-vivid")).toBeNull();
  // One swatch per thread, with its name in full.
  expect(root.querySelectorAll("#clusters .cluster .swatch").length).toBe(
    root.querySelectorAll("#clusters .cluster").length,
  );
  expect(root.querySelector("#clusters .orig")).toBeNull();
});

it("adds an embroidery file as a layer, keeps it through saving, and sends its stitches", async () => {
  const plan = E.plan(
    {
      labels: new Uint8Array(E.GRID * E.GRID),
      order: [],
      lines: [
        {
          kind: "run",
          color: 5,
          pts: [
            [30, 30, 0],
            [50, 30, 0],
            [50, 45, 0],
          ],
        },
        {
          kind: "run",
          color: 20,
          pts: [
            [40, 60, 0],
            [60, 60, 0],
          ],
        },
      ],
    },
    {},
  );
  const out = E.toStream(plan);
  const bytes = new Uint8Array(E.writePES(out.stream, out.colors, "bought"));
  const choose = (file) => {
    Object.defineProperty(button("#add-stitch-file"), "files", {
      configurable: true,
      value: [file],
    });
    button("#add-stitch-file").dispatchEvent(new Event("change"));
  };
  const before = studio.snapshot().layers.length;
  vi.useRealTimers();
  choose(new File([bytes], "bought-rose.pes"));
  await vi.waitFor(() =>
    expect(studio.snapshot().layers).toHaveLength(before + 1),
  );
  const saved = studio.snapshot(),
    layer = saved.layers.at(-1);
  expect(saved.v).toBe(6);
  expect(layer.kind).toBe("stitches");
  expect(layer.name).toBe("bought-rose");
  expect(layer.source.slots).toEqual([5, 20]);
  expect(button("#panel-stitches").hidden).toBe(false);
  expect(root.querySelectorAll("#slots .cluster")).toHaveLength(2);
  // Underlay and pull are for stitches this app generates; a file brings its own.
  expect(button("#object-stitches").hidden).toBe(true);

  await vi.waitFor(() => expect(button("#send").disabled).toBe(false));
  button("#send").click();
  const design = onSend.mock.calls.at(-1)[0];
  expect(design.threads.slice(-2).map((t) => t.index)).toEqual([5, 20]);

  studio.destroy();
  studio = mountStudio(root, { project: saved, onSend });
  expect(studio.snapshot().layers.at(-1).source).toEqual(layer.source);

  // Something that is not an embroidery file is refused with a reason, and adds nothing.
  choose(new File(["just some text, not stitches at all"], "notes.pes"));
  await vi.waitFor(() =>
    expect(button("#toast").textContent).toMatch(/not a Brother \.pes file/),
  );
  expect(studio.snapshot().layers).toHaveLength(before + 1);
});

// A flat "portrait": a pale edge, a blue-gray wall, skin, dark hair and a maroon top. With the
// background kept, the hair and the top fall into one colour; with it removed they are two.
let stripe = false;
function portrait(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w,
        v = y / h;
      let c = [244, 241, 234];
      if (u > 0.14 && u < 0.86 && v > 0.14 && v < 0.86) c = [120, 137, 155];
      if (u > 0.3 && u < 0.7 && v > 0.25 && v < 0.7) c = [208, 162, 132];
      if (u > 0.28 && u < 0.72 && v > 0.16 && v < 0.3) c = [74, 58, 50];
      if (u > 0.3 && u < 0.7 && v > 0.7 && v < 0.86) c = [124, 47, 58];
      // On request, a green stripe down the face: 1 mm wide at the size the picture is added at.
      if (stripe && u > 0.49 && u < 0.51 && v > 0.3 && v < 0.7)
        c = [30, 110, 60];
      data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  return { data };
}

describe("the colours of a picture", () => {
  const rows = () =>
    [...root.querySelectorAll("#clusters .cluster")].map(
      (row) =>
        row.querySelector("strong").textContent +
        (row.querySelector(".pill").getAttribute("aria-pressed") === "true"
          ? ""
          : " (skipped)"),
    );
  const settle = () => vi.advanceTimersByTimeAsync(150);
  const colors = async (k) => {
    input("#img-k", k);
    await settle();
  };
  const background = async () => {
    button("#img-bg").click();
    await settle();
  };
  const pick = async (row, thread) => {
    root.querySelectorAll("#clusters .cluster .swatch")[row].click();
    root.querySelector(`#sheet-palette [aria-label="${thread}"]`).click();
    button("#sheet-close").click();
    await settle();
  };

  beforeEach(async () => {
    stripe = false;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        new Proxy(canvasContext(), {
          get: (target, key) =>
            key === "getImageData"
              ? (_x, _y, w, h) => portrait(w, h)
              : target[key],
        }),
    );
    let decode;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => new Promise((resolve) => (decode = resolve))),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,cGljdHVyZQ==",
    );
    Object.defineProperty(button("#add-picture-file"), "files", {
      configurable: true,
      value: [new File(["x"], "portrait.png")],
    });
    button("#add-picture-file").dispatchEvent(new Event("change"));
    decode({ width: 400, height: 400, close: vi.fn() });
    await vi.advanceTimersByTimeAsync(70);
  });

  it("are the same for the same settings, whichever way the settings were reached", async () => {
    const four = rows();
    expect(four).toHaveLength(4);
    expect(new Set(four).size).toBe(4);

    // Taking the background out of "removed" and putting it back changes nothing.
    await background();
    const kept = rows();
    expect(kept).not.toEqual(four);
    await background();
    expect(rows()).toEqual(four);
    await background();
    expect(rows()).toEqual(kept);
    await background();

    // Six colours, reached directly, one step at a time, and by way of the background.
    await colors(6);
    const six = rows();
    for (const k of [1, 2, 3, 4, 5, 6]) await colors(k);
    expect(rows()).toEqual(six);
    await background();
    await colors(3);
    await background();
    await colors(6);
    expect(rows()).toEqual(six);
    await colors(4);
    expect(rows()).toEqual(four);

    // So do size and speck clean-up.
    input("#img-size", 40);
    await settle();
    root.querySelector('#img-clean [data-clean="3"]').click();
    await settle();
    input("#img-size", 50);
    await settle();
    root.querySelector('#img-clean [data-clean="2"]').click();
    await settle();
    expect(rows()).toEqual(four);
  });

  it("keep a thread picked by hand with its colour, and nothing else", async () => {
    const four = rows();
    expect(button("#img-rematch").hidden).toBe(true);
    await pick(0, "Lime Green");
    const mine = ["Lime Green", ...four.slice(1)];
    expect(rows()).toEqual(mine);
    expect(button("#img-rematch").hidden).toBe(false);
    expect(root.querySelector("#clusters .cluster small").textContent).toMatch(
      /your pick/,
    );

    // The pick follows its colour through other settings and is there on the way back.
    await background();
    expect(rows()).toContain("Lime Green");
    await colors(1);
    expect(rows()).not.toContain("Lime Green");
    await colors(4);
    await background();
    expect(rows()).toEqual(mine);

    // Skipping a colour is kept the same way.
    root.querySelectorAll("#clusters .cluster .pill")[1].click();
    await settle();
    const skipped = [mine[0], mine[1] + " (skipped)", ...mine.slice(2)];
    expect(rows()).toEqual(skipped);
    await colors(6);
    await colors(4);
    expect(rows()).toEqual(skipped);

    // It is saved with the design and comes back with it.
    const saved = studio.snapshot();
    expect(saved.layers.at(-1).source.choices).toHaveLength(2);

    // One button goes back to the matched threads; a skipped colour stays skipped.
    button("#img-rematch").click();
    await settle();
    expect(rows()).toEqual([four[0], four[1] + " (skipped)", ...four.slice(2)]);
    expect(button("#img-rematch").hidden).toBe(true);
    button("#undo").click();
    await settle();
    expect(rows()).toEqual(skipped);
  });

  it("fold a part too thin to stitch into the colour beside it, unless clean-up is Light", async () => {
    const thin = /thinner than about 1\.2 mm/;
    const clean = async (level) => {
      root.querySelector(`#img-clean [data-clean="${level}"]`).click();
      await settle();
      await vi.advanceTimersByTimeAsync(100);
    };
    stripe = true;
    await colors(5);
    await vi.advanceTimersByTimeAsync(100);
    // Medium: the stripe has gone into the skin either side of it, so it is not a thread to buy
    // and there is nothing to warn about.
    expect(rows()).toHaveLength(4);
    expect(button("#note").textContent).not.toMatch(thin);

    // Light keeps it, and the warning says what would deal with it.
    await clean(1);
    expect(rows()).toHaveLength(5);
    expect(button("#note").textContent).toMatch(thin);
    expect(button("#note").textContent).toMatch(
      /Set Clean up specks to Medium/,
    );

    await clean(3);
    expect(rows()).toHaveLength(4);
    expect(button("#note").textContent).not.toMatch(thin);

    // Shown at twice the size the stripe is 2 mm wide, which stitches: it is kept, with no warning.
    input("#layer-size", "200");
    await vi.advanceTimersByTimeAsync(200);
    expect(rows()).toHaveLength(5);
    expect(button("#note").textContent).not.toMatch(thin);
    input("#layer-size", "100");
    await vi.advanceTimersByTimeAsync(200);
    expect(rows()).toHaveLength(4);
  });

  it("come back as they were saved, also from a design saved before hand picks were kept", async () => {
    vi.stubGlobal(
      "Image",
      class {
        width = 400;
        height = 400;
        set src(value) {
          this.url = value;
          Promise.resolve().then(() => this.onload?.());
        }
      },
    );
    const reopen = async (project) => {
      studio.destroy();
      studio = mountStudio(root, { project, onSend });
      await vi.advanceTimersByTimeAsync(100);
    };
    const four = rows();
    await pick(3, "Dark Brown");
    const mine = [...four.slice(0, 3), "Dark Brown"];
    expect(rows()).toEqual(mine);
    const saved = studio.snapshot();
    await reopen(saved);
    expect(rows()).toEqual(mine);
    expect(studio.snapshot().layers.at(-1).source).toEqual(
      saved.layers.at(-1).source,
    );
    await background();
    await background();
    expect(rows()).toEqual(mine);

    // Old files cannot distinguish manual and automatic picks, so preserve all saved threads.
    const old = structuredClone(saved);
    const source = old.layers.at(-1).source;
    delete source.choices;
    source.clusters[0].thread = 5;
    source.clusters[1].on = false;
    await reopen(old);
    const matched = ["Red", four[1] + " (skipped)", four[2], "Dark Brown"];
    expect(rows()).toEqual(matched);
    expect(button("#img-rematch").hidden).toBe(false);
    expect(root.querySelector("#clusters").textContent).toMatch(/your pick/);
    expect(studio.snapshot().layers.at(-1).source.choices).toHaveLength(4);
    await colors(2);
    await colors(4);
    expect(rows()).toEqual(matched);
  });
});

import {
  emptyProject,
  exportProject,
  importProject,
} from "../projects/projectFile";
const identity = { x: 0, y: 0, scale: 1, rotation: 0 };
function reviewDrawing(id, color, visible = true) {
  return {
    id,
    name: id,
    kind: "draw",
    visible,
    transform: { ...identity },
    source: {
      ...emptyProject().draw,
      strokes: [
        {
          k: "run",
          c: color,
          p: [
            [20, 20, 0],
            [30, 20, 0],
          ],
        },
      ],
    },
  };
}
function reviewLayers(layers) {
  studio.destroy();
  studio = mountStudio(root, {
    project: { ...emptyProject(), v: 6, layers, activeLayerId: layers[0].id },
    onSend,
  });
  vi.advanceTimersByTime(70);
}
it("does not merge across an intervening layer or revive excluded drawings", () => {
  const text = {
    id: "text",
    name: "text",
    kind: "text",
    visible: true,
    transform: { ...identity },
    source: { ...emptyProject().text, value: "A", color: 2 },
  };
  for (const layers of [
    [reviewDrawing("first", 5), text, reviewDrawing("last", 37)],
    [reviewDrawing("visible", 5), reviewDrawing("hidden", 37, false)],
    [reviewDrawing("hidden", 5, false), reviewDrawing("visible", 37)],
  ]) {
    reviewLayers(layers);
    studio.send();
    const before = onSend.mock.calls.at(-1)[0];
    expect(button("#layer-merge").hidden).toBe(true);
    button("#layer-merge").click();
    vi.advanceTimersByTime(70);
    studio.send();
    expect(onSend.mock.calls.at(-1)[0].stitches).toEqual(before.stitches);
    expect(studio.snapshot().layers).toHaveLength(layers.length);
  }
});
it("refuses merges that would combine different settings or reorder thread passes", () => {
  reviewLayers([reviewDrawing("first", 5), reviewDrawing("second", 37)]);
  button("#stitch-custom").checked = true;
  button("#stitch-custom").dispatchEvent(new Event("change"));
  expect(button("#layer-merge").hidden).toBe(true);
  const first = reviewDrawing("first", 5);
  first.source.strokes.push({
    k: "run",
    c: 2,
    p: [
      [25, 30, 0],
      [35, 30, 0],
    ],
  });
  reviewLayers([first, reviewDrawing("second", 5)]);
  studio.send();
  const before = onSend.mock.calls.at(-1)[0].stitches;
  button("#layer-merge").click();
  vi.advanceTimersByTime(70);
  studio.send();
  expect(studio.snapshot().layers).toHaveLength(2);
  expect(onSend.mock.calls.at(-1)[0].stitches).toEqual(before);
  expect(button("#toast").textContent).toMatch(/thread order/);
});
it("preserves PES cut flags and repeated-color stops through v6 files, undo and transforms", async () => {
  const source = {
    fileName: "cut.pes",
    slots: [5, 5],
    paths: [
      { s: 0, p: [30, 30, 31, 30], j: false, t: false },
      { s: 0, p: [31.5, 30, 32.5, 30], j: true, t: true },
      { s: 1, p: [32.5, 30, 33.5, 30], j: false, t: false },
    ],
  };
  reviewLayers([
    {
      id: "pes",
      name: "PES",
      kind: "stitches",
      visible: true,
      transform: { ...identity },
      source,
    },
  ]);
  studio.send();
  const before = onSend.mock.calls.at(-1)[0];
  expect(before.threads.map((t) => t.index)).toEqual([5, 5]);
  expect(before.stitches.filter((s) => s[2] === 0x30)).toHaveLength(1);
  const project = importProject(exportProject(studio.snapshot()));
  expect(project.v).toBe(6);
  expect(project.layers[0].source.paths).toEqual(source.paths);
  studio.destroy();
  studio = mountStudio(root, { project, onSend });
  await vi.advanceTimersByTimeAsync(70);
  studio.send();
  expect(onSend.mock.calls.at(-1)[0].stitches).toEqual(before.stitches);
  input("#layer-rotation", "90");
  await vi.advanceTimersByTimeAsync(70);
  studio.send();
  expect(onSend.mock.calls.at(-1)[0].threads.map((t) => t.index)).toEqual([
    5, 5,
  ]);
  expect(
    onSend.mock.calls.at(-1)[0].stitches.filter((s) => s[2] === 0x30),
  ).toHaveLength(1);
  button("#undo").click();
  await vi.advanceTimersByTimeAsync(70);
  studio.send();
  expect(onSend.mock.calls.at(-1)[0].stitches).toEqual(before.stitches);
  const legacy = structuredClone(project);
  legacy.v = 5;
  legacy.layers[0].source.paths.forEach((p) => {
    delete p.j;
    delete p.t;
  });
  studio.destroy();
  studio = mountStudio(root, { project: legacy, onSend });
  await vi.advanceTimersByTimeAsync(70);
  expect(button("#stitch-file-name").textContent).toMatch(
    /re-import the original PES/,
  );
  expect(
    importProject(exportProject(studio.snapshot())).layers[0].source
      .legacyCommands,
  ).toBe(true);
});
