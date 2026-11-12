import { describe, expect, it } from "vitest";
import { emptyProject, exportProject, importProject } from "./projectFile";

describe("editable project files", () => {
  it("round trips drawings, text, pictures, thread overrides and settings", () => {
    const data = emptyProject();
    data.name = "A saved heart";
    data.mode = "image";
    data.draw.strokes.push({
      k: "satin",
      c: 5,
      p: [
        [10, 10, 3],
        [20, 20, 3],
      ],
    });
    data.image.sourceDataURL = "data:image/png;base64,AAAA";
    data.image.fileName = "flower.png";
    data.image.clusters = [{ rgb: [120, 30, 20], thread: 5, on: false }];
    data.text.value = "Hello\nRavi";
    data.settings.angle = 90;
    data.placement = { x: 200, y: -100, rotation: 45 };
    const restored = importProject(exportProject(data));
    expect(restored).toMatchObject(data);
    restored.draw.strokes[0].p[0][0] = 50;
    expect(data.draw.strokes[0].p[0][0]).toBe(10);
  });
  it.each([
    (d: ReturnType<typeof emptyProject>) => {
      d.settings.spacing = 0;
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.draw.labels = [5, 250001];
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.draw.labels = [5, -1];
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.draw.strokes = [{ k: "run", c: 5, p: [[Infinity, 0, 0]] }];
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.image.sourceDataURL = "https://example.com/tracker.png";
    },
    (d: ReturnType<typeof emptyProject>) => {
      d.image.sourceDataURL = "data:image/svg+xml;base64,AAAA";
    },
  ])("rejects invalid engine parameters and external images", (mutate) => {
    const data = emptyProject();
    mutate(data);
    expect(() =>
      importProject(
        JSON.stringify({ format: "respira-project", version: 1, data }),
      ),
    ).toThrow();
  });
  it("rejects malformed files and unsupported versions", () => {
    for (const text of [
      "not json",
      "null",
      "{}",
      JSON.stringify({
        format: "respira-project",
        version: 2,
        data: emptyProject(),
      }),
    ])
      expect(() => importProject(text)).toThrow();
  });
});

it("round trips a v2 mixed composition without duplicating image payloads", () => {
  const base = emptyProject();
  const data: import("./projectFile").ProjectData = {
    ...base,
    v: 2,
    activeLayerId: "text",
    layers: [
      {
        id: "drawing",
        name: "Border",
        kind: "draw",
        source: base.draw,
        visible: true,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      },
      {
        id: "photo",
        name: "Picture",
        kind: "image",
        source: {
          ...base.image,
          sourceDataURL: "data:image/png;base64,AAAA",
          fileName: "flower.png",
          clusters: [],
        },
        visible: true,
        transform: { x: -20, y: -20, scale: 0.5, rotation: 15 },
      },
      {
        id: "text",
        name: "Name",
        kind: "text",
        source: {
          ...base.text,
          font: "SmallSatin",
          value: "Ravi",
          heightMM: 8,
          letterSpacing: 0.6,
          lineGap: 2,
          align: "center",
        },
        visible: true,
        transform: { x: 0, y: 30, scale: 1, rotation: 0 },
      },
    ],
  };
  expect(importProject(exportProject(data)).layers).toEqual(data.layers);
  const duplicate = structuredClone(data);
  duplicate.layers![1].id = "drawing";
  expect(() => exportProject(duplicate)).toThrow();
  const badScale = structuredClone(data);
  badScale.layers![0].transform.scale = 0;
  expect(() => exportProject(badScale)).toThrow();
  const badSelection = structuredClone(data);
  badSelection.activeLayerId = "missing";
  expect(() => exportProject(badSelection)).toThrow();
});

it("preserves version 3 custom stitch settings and rejects invalid values", () => {
  const base = emptyProject();
  const settings: import("./projectFile").ObjectStitchSettings = {
    fillUnderlay: "edge-tatami",
    satinUnderlay: "center-zigzag",
    fillPullMm: 0,
    satinPullMm: 0.3,
    underlayInsetMm: 0.4,
    underlaySpacingMm: 2,
    underlayStitchMm: 1.5,
    fillSpacing: 0.4,
    fillAngle: 45,
    satinSpacingMm: 0.45,
  };
  const data: import("./projectFile").ProjectData = {
    ...base,
    v: 3,
    activeLayerId: "d",
    layers: [
      {
        id: "d",
        name: "Drawing",
        kind: "draw",
        source: base.draw,
        visible: true,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        stitchSettings: settings,
      },
    ],
  };
  expect(importProject(exportProject(data)).layers?.[0].stitchSettings).toEqual(
    settings,
  );
  for (const [key, value] of [
    ["fillPullMm", -1],
    ["satinPullMm", 2],
    ["underlayStitchMm", 0],
    ["underlaySpacingMm", 0],
    ["satinUnderlay", "unknown"],
  ]) {
    const invalid = structuredClone(data);
    Object.assign(invalid.layers![0].stitchSettings!, { [key]: value });
    expect(() => exportProject(invalid)).toThrow();
  }
});
