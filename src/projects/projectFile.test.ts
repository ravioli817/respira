import { describe, expect, it } from "vitest";
import {
  emptyProject,
  exportProject,
  importProject,
  validateProject,
} from "./projectFile";

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

it("round-trips v4 lettering fonts and trim rules, while still importing older projects", () => {
  for (const font of ["RoundedSatin", "ScriptSatin"]) {
    const data = emptyProject();
    const source = {
      ...data.text,
      font,
      heightMM: 19,
      trimRule: "word" as const,
    };
    const project = {
      ...data,
      v: 4 as const,
      activeLayerId: "name",
      layers: [
        {
          id: "name",
          name: "Bharti",
          kind: "text" as const,
          visible: true,
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          source,
        },
      ],
    };
    const roundtrip = importProject(exportProject(project));
    expect(roundtrip.v).toBe(4);
    expect(roundtrip.layers?.[0].source).toEqual(source);
    expect(() =>
      validateProject({
        ...project,
        layers: [
          { ...project.layers[0], source: { ...source, trimRule: "invalid" } },
        ],
      }),
    ).toThrow();
  }
  expect(importProject(exportProject(emptyProject())).v).toBe(1);
});

it("round-trips version 5: an embroidery-file layer and a cropped, vivid picture", () => {
  const data = emptyProject();
  const stitches = {
    fileName: "bought-rose.pes",
    slots: [5, 20],
    paths: [
      { s: 0, p: [30, 30, 40, 30, 50, 30] },
      { s: 1, p: [40, 60, 60, 60] },
    ],
  };
  const picture = {
    ...data.image,
    vivid: true,
    crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
    fileName: "",
    clusters: [],
  };
  const project = {
    ...data,
    v: 5 as const,
    mode: "stitches" as const,
    activeLayerId: "file",
    layers: [
      {
        id: "file",
        name: "bought-rose",
        kind: "stitches" as const,
        visible: true,
        transform: { x: 4, y: -6, scale: 1, rotation: 30 },
        source: stitches,
      },
      {
        id: "photo",
        name: "Picture",
        kind: "image" as const,
        visible: true,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        source: picture,
      },
    ],
  };
  const roundtrip = importProject(exportProject(project));
  expect(roundtrip.v).toBe(5);
  expect(roundtrip.layers?.[0].source).toEqual(stitches);
  expect(roundtrip.layers?.[1].source).toMatchObject({
    vivid: true,
    crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 },
  });
  const withSource = (source: unknown) => ({
    ...project,
    layers: [{ ...project.layers[0], source }, project.layers[1]],
  });
  // A run must name a thread the file has, hold whole points, and not be empty.
  for (const paths of [
    [{ s: 2, p: [0, 0, 1, 1] }],
    [{ s: 0, p: [0, 0, 1] }],
    [{ s: 0, p: [0, 0] }],
    [],
  ])
    expect(() => validateProject(withSource({ ...stitches, paths }))).toThrow();
  expect(() =>
    validateProject(withSource({ ...stitches, slots: [64] })),
  ).toThrow();
  // A crop box has to lie inside the picture.
  expect(() =>
    validateProject({
      ...project,
      layers: [
        project.layers[0],
        {
          ...project.layers[1],
          source: { ...picture, crop: { x: 0.6, y: 0, w: 0.5, h: 1 } },
        },
      ],
    }),
  ).toThrow();
});
